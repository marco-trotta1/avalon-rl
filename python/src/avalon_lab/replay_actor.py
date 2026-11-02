"""Keep an untrusted observation-to-action policy in one Docker container."""

from collections.abc import Mapping
import hashlib
import json
import keyword
import math
import os
import re
import selectors
import subprocess
import time
import uuid
from typing import Literal

from .replay_contract import Json, parse_replay_files
from .replay_runner import _docker_argv, _docker_endpoint, _docker_environment, _hash, _image_id, _no_duplicates, _remove_container

MAX_MESSAGE_BYTES = 65_536
MAX_SESSION_OUTPUT_BYTES = 1_048_576
MAX_INITIAL_BYTES = 8_388_608

ACTOR_HARNESS = r'''
import contextlib, importlib.util, json, os, pathlib, sys
initial = json.loads(sys.stdin.readline())
root = pathlib.Path("/tmp/policy")
root.mkdir()
for name, content in initial["files"].items():
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
os.chdir(root)
sys.path.insert(0, str(root))
with contextlib.redirect_stdout(sys.stderr):
    spec = importlib.util.spec_from_file_location("policy", root / initial["entrypoint_file"])
    module = importlib.util.module_from_spec(spec)
    sys.modules["policy"] = module
    spec.loader.exec_module(module)
    act = getattr(module, initial["function"])
print(json.dumps({"id": initial["id"], "ready": True}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    with contextlib.redirect_stdout(sys.stderr):
        action = act(request["observation"])
    print(json.dumps({"id": request["id"], "action": action}, allow_nan=False), flush=True)
'''


class ActorError(RuntimeError):
    """Expose a stable reason without captured policy output."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _actor_argv(*, image_id: str, name: str, endpoint: str) -> list[str]:
    command = _docker_argv(image_id=image_id, name=name, endpoint=endpoint)
    return [*command[:-1], ACTOR_HARNESS]


def _json_value(value: object, depth: int = 0) -> Json:
    if depth > 24:
        raise ActorError("protocol")
    if value is None or isinstance(value, (str, bool)):
        return value
    if type(value) is int:
        if abs(value) > 9_007_199_254_740_991:
            raise ActorError("protocol")
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise ActorError("protocol")
        return value
    if isinstance(value, list):
        return [_json_value(item, depth + 1) for item in value]
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        return {key: _json_value(item, depth + 1) for key, item in value.items()}
    raise ActorError("protocol")


def _message(raw: bytes) -> dict:
    def invalid_constant(_):
        raise ValueError("Use finite JSON values.")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_no_duplicates, parse_constant=invalid_constant)
        value = _json_value(value)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ActorError("protocol") from error
    if not isinstance(value, dict):
        raise ActorError("protocol")
    return value


class DockerPolicySession:
    """Run one policy process for one episode. The host owns the environment."""

    def __init__(self, *, files: Mapping[str, str], entrypoint_file: str, function: str, image: str,
                 timeout_seconds: int = 5, max_actions: int = 500, episode_timeout_seconds: int = 60):
        self.files = parse_replay_files(dict(files))
        if entrypoint_file not in self.files or not entrypoint_file.endswith(".py"):
            raise ValueError("Select a Python entrypoint from the policy files.")
        if not isinstance(function, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,119}", function) or keyword.iskeyword(function):
            raise ValueError("Use a valid Python function identifier.")
        if not isinstance(image, str) or not image or image.startswith("-") or len(image) > 300:
            raise ValueError("Supply a local Docker image name or digest.")
        if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 60:
            raise ValueError("Set an action timeout from one through sixty seconds.")
        if type(max_actions) is not int or not 1 <= max_actions <= 20_000:
            raise ValueError("Set an episode limit from one through 20,000 actions.")
        if type(episode_timeout_seconds) is not int or not 1 <= episode_timeout_seconds <= 300:
            raise ValueError("Set an episode timeout from one through 300 seconds.")
        self.entrypoint_file = entrypoint_file
        self.function = function
        self.image = image
        self.timeout_seconds = timeout_seconds
        self.max_actions = max_actions
        self.episode_timeout_seconds = episode_timeout_seconds
        self.candidate_hash = _hash(dict(self.files))
        self.image_id: str | None = None
        self._endpoint: str | None = None
        self._name: str | None = None
        self._process: subprocess.Popen | None = None
        self._state: Literal["new", "starting", "ready", "closed"] = "new"
        self._started_at: float | None = None
        self._actions = 0
        self._output_bytes = 0
        self._stdout_hash = hashlib.sha256()
        self._stderr_hash = hashlib.sha256()
        self._buffer = bytearray()
        self._close_receipt: dict | None = None

    def start(self) -> None:
        if self._state != "new":
            raise ActorError("state")
        self._state = "starting"
        try:
            self._endpoint = _docker_endpoint()
            self.image_id = _image_id(self.image, self._endpoint)
            self._name = "avalon-actor-" + uuid.uuid4().hex
            self._started_at = time.monotonic()
            self._process = subprocess.Popen(
                _actor_argv(image_id=self.image_id, name=self._name, endpoint=self._endpoint),
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=_docker_environment(),
            )
            for stream in (self._process.stdin, self._process.stdout, self._process.stderr):
                os.set_blocking(stream.fileno(), False)
            nonce = uuid.uuid4().hex
            response = self._exchange({"id": nonce, "files": dict(self.files),
                                       "entrypoint_file": self.entrypoint_file, "function": self.function},
                                      maximum=MAX_INITIAL_BYTES)
            if set(response) != {"id", "ready"} or response["id"] != nonce or response["ready"] is not True:
                raise ActorError("protocol")
            self._state = "ready"
        except ActorError:
            self.close()
            raise
        except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
            self.close()
            raise ActorError("startup") from error

    def act(self, observation: Json) -> Json:
        if self._state != "ready":
            raise ActorError("state")
        try:
            if self._actions >= self.max_actions:
                raise ActorError("action-limit")
            nonce = uuid.uuid4().hex
            response = self._exchange({"id": nonce, "observation": _json_value(observation)}, maximum=MAX_MESSAGE_BYTES)
            if set(response) != {"id", "action"} or response["id"] != nonce:
                raise ActorError("protocol")
            self._actions += 1
            return response["action"]
        except ActorError:
            self.close()
            raise
        except (OSError, ValueError, UnicodeError, RecursionError) as error:
            self.close()
            raise ActorError("process") from error

    def _exchange(self, value: dict, *, maximum: int) -> dict:
        process = self._process
        if process is None or process.poll() is not None:
            raise ActorError("process")
        if self._buffer:
            raise ActorError("protocol")
        try:
            payload = (json.dumps(value, allow_nan=False, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        except (ValueError, UnicodeError, RecursionError) as error:
            raise ActorError("protocol") from error
        if len(payload) > maximum:
            raise ActorError("input-limit")
        offset = 0
        if self._started_at is None:
            raise ActorError("state")
        episode_deadline = self._started_at + self.episode_timeout_seconds
        action_deadline = time.monotonic() + self.timeout_seconds
        deadline = min(action_deadline, episode_deadline)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdin, selectors.EVENT_WRITE)
            selector.register(process.stdout, selectors.EVENT_READ)
            selector.register(process.stderr, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    reason = "episode-timeout" if time.monotonic() >= episode_deadline else "timeout"
                    raise ActorError(reason)
                for key, event in selector.select(min(remaining, 0.1)):
                    stream = key.fileobj
                    if event == selectors.EVENT_WRITE:
                        try:
                            offset += os.write(stream.fileno(), payload[offset:offset + 8192])
                        except BlockingIOError:
                            continue
                        except BrokenPipeError as error:
                            raise ActorError("process") from error
                        if offset == len(payload):
                            selector.unregister(stream)
                        continue
                    try:
                        data = os.read(stream.fileno(), 8192)
                    except BlockingIOError:
                        continue
                    if not data:
                        if stream is process.stdout:
                            raise ActorError("process")
                        selector.unregister(stream)
                        continue
                    self._output_bytes += len(data)
                    if stream is process.stdout:
                        self._stdout_hash.update(data)
                    else:
                        self._stderr_hash.update(data)
                    if self._output_bytes > MAX_SESSION_OUTPUT_BYTES:
                        raise ActorError("output-limit")
                    if stream is process.stderr:
                        continue
                    self._buffer.extend(data)
                    if len(self._buffer) > MAX_MESSAGE_BYTES:
                        raise ActorError("output-limit")
                    if b"\n" in self._buffer:
                        line, remainder = self._buffer.split(b"\n", 1)
                        self._buffer.clear()
                        if remainder or offset != len(payload):
                            raise ActorError("protocol")
                        now = time.monotonic()
                        if now >= deadline:
                            raise ActorError("episode-timeout" if now >= episode_deadline else "timeout")
                        return _message(bytes(line))

    def close(self) -> dict:
        if self._close_receipt is not None:
            return dict(self._close_receipt)
        self._state = "closed"
        process_stopped = True
        if self._process is not None:
            try:
                if self._process.poll() is None:
                    self._process.kill()
                self._process.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                process_stopped = False
            finally:
                for stream in (self._process.stdin, self._process.stdout, self._process.stderr):
                    if stream and not stream.closed:
                        stream.close()
        removed = self._process is None
        if self._process is not None:
            for attempt in range(2):
                removed = _remove_container(self._name, self._endpoint)
                if removed:
                    break
                if attempt == 0:
                    time.sleep(0.05)
        cleanup_blocked = not (process_stopped and removed)
        self._close_receipt = {
            "cleanup_blocked": cleanup_blocked,
            "container_name": self._name if cleanup_blocked else None,
            "actions": self._actions, "output_bytes": self._output_bytes,
            "stdout_sha256": self._stdout_hash.hexdigest(), "stderr_sha256": self._stderr_hash.hexdigest(),
        }
        return dict(self._close_receipt)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
