"""Execute trusted behavioral specifications in isolated Docker containers."""

from collections.abc import Mapping
import hashlib
import json
import math
import os
import re
import selectors
import subprocess
import time
import uuid
from typing import Literal

from .replay_contract import ReplayTask, parse_replay_files, task_hash

OUTPUT_LIMIT = 65_536

HARNESS = r'''
import contextlib, hashlib, importlib.util, json, os, pathlib, sys
payload = json.load(sys.stdin)
root = pathlib.Path("/tmp/task")
root.mkdir()
for name, text in payload["files"].items():
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
os.chdir(root)
sys.path.insert(0, str(root))
with contextlib.redirect_stdout(sys.stderr):
    spec = importlib.util.spec_from_file_location("candidate", root / payload["path"])
    module = importlib.util.module_from_spec(spec)
    sys.modules["candidate"] = module
    spec.loader.exec_module(module)
    result = getattr(module, payload["function"])(*payload["args"], **payload["kwargs"])
protected = {}
for name in payload["protected_paths"]:
    path = root / name
    if not path.is_file() or path.is_symlink():
        protected[name] = None
    else:
        with path.open("rb") as stream:
            data = stream.read(1048577)
        protected[name] = hashlib.sha256(data).hexdigest() if len(data) <= 1048576 else None
print(json.dumps({"result": result, "protected": protected}, allow_nan=False, separators=(",", ":")))
'''


def _hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("The result contains a duplicate key.")
        result[key] = value
    return result


def _parse_output(raw: bytes) -> dict:
    def reject_constant(_):
        raise ValueError("The result contains a non-finite number.")
    def finite_float(text):
        number = float(text)
        if not math.isfinite(number):
            raise ValueError("The result contains a non-finite number.")
        return number
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=_no_duplicates, parse_constant=reject_constant,
                       parse_float=finite_float)
    if not isinstance(value, dict) or set(value) != {"result", "protected"} or not isinstance(value["protected"], dict):
        raise ValueError("The result does not match the execution protocol.")
    return value


def _docker_environment() -> dict[str, str]:
    return {key: os.environ[key] for key in ("PATH", "HOME", "DOCKER_CONFIG") if key in os.environ}


def _docker_endpoint() -> str:
    if os.name != "posix":
        raise RuntimeError("Use a local Unix Docker endpoint on a POSIX system.")
    context = os.environ.get("DOCKER_CONTEXT")
    endpoint = os.environ.get("DOCKER_HOST") if not context else None
    if not endpoint:
        command = ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]
        if context:
            if context.startswith("-") or "\x00" in context:
                raise RuntimeError("Use a valid Docker context with a local Unix endpoint.")
            command.append(context)
        result = subprocess.run(command, capture_output=True, timeout=10, check=False, env=_docker_environment())
        if result.returncode:
            raise RuntimeError("Cannot resolve the Docker context to a local Unix endpoint.")
        endpoint = result.stdout.decode("utf-8").strip()
    if not endpoint.startswith("unix:///") or "\x00" in endpoint or any(char in endpoint for char in "\r\n?#"):
        raise RuntimeError("Use a local Unix Docker endpoint with an absolute socket path.")
    return endpoint


def _docker_argv(*, image_id: str, name: str, endpoint: str) -> list[str]:
    return ["docker", "--host", endpoint, "run", "--rm", "--name", name, "--pull", "never", "--network", "none",
            "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32",
            "--memory", "128m", "--memory-swap", "128m", "--cpus", "1", "--user", "65534:65534",
            "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777", "--workdir", "/tmp",
            "--entrypoint", "python", "--env", "PYTHONDONTWRITEBYTECODE=1", "--env", "PYTHONHASHSEED=0", "-i", image_id,
            "-I", "-B", "-c", HARNESS]


def _bounded_process(argv: list[str], payload: bytes, timeout_seconds: int) -> tuple[int, bytes, str | None]:
    process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=_docker_environment())
    output = bytearray()
    total_output = 0
    offset = 0
    issue = None
    deadline = time.monotonic() + timeout_seconds
    try:
        with selectors.DefaultSelector() as selector:
            for stream, event in ((process.stdin, selectors.EVENT_WRITE), (process.stdout, selectors.EVENT_READ), (process.stderr, selectors.EVENT_READ)):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, event)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    issue = "timeout"
                    break
                for key, event in selector.select(min(remaining, 0.1)):
                    stream = key.fileobj
                    if event == selectors.EVENT_WRITE:
                        try:
                            offset += os.write(stream.fileno(), payload[offset:offset + 8192])
                        except BlockingIOError:
                            continue
                        except BrokenPipeError:
                            offset = len(payload)
                        if offset == len(payload):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        try:
                            data = os.read(stream.fileno(), 8192)
                        except BlockingIOError:
                            continue
                        if not data:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        total_output += len(data)
                        if total_output > OUTPUT_LIMIT:
                            issue = "output-limit"
                            break
                        if stream is process.stdout:
                            output.extend(data)
                if issue:
                    break
        if issue:
            process.kill()
        try:
            code = process.wait(timeout=max(0.01, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            issue = "timeout"
            process.kill()
            code = process.wait(timeout=5)
        return code, bytes(output), issue
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream and not stream.closed:
                stream.close()


def _remove_container(name: str, endpoint: str) -> bool:
    try:
        result = subprocess.run(["docker", "--host", endpoint, "rm", "--force", name], stdin=subprocess.DEVNULL,
                                capture_output=True, timeout=5, check=False, env=_docker_environment())
        return result.returncode == 0 or b"No such container" in result.stderr
    except (OSError, subprocess.TimeoutExpired):
        return False


def _image_id(image: str, endpoint: str) -> str:
    if not image or image.startswith("-") or len(image) > 300:
        raise ValueError("Supply a local Docker image name or digest.")
    result = subprocess.run(["docker", "--host", endpoint, "image", "inspect", "--format", "{{.Id}}", image],
                            capture_output=True, timeout=10, check=False, env=_docker_environment())
    value = result.stdout.decode("utf-8").strip()
    if result.returncode or not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        raise RuntimeError("The local Docker image is unavailable. Start Docker and load the image first.")
    return value


def _values_equal(actual: object, expected: object) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if type(actual) is int and type(expected) is int:
        return actual == expected
    if type(actual) in (int, float) and type(expected) in (int, float):
        try:
            return math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-12)
        except OverflowError:
            return False
    if type(actual) is not type(expected):
        return False
    if isinstance(actual, list):
        return len(actual) == len(expected) and all(_values_equal(left, right) for left, right in zip(actual, expected))
    if isinstance(actual, dict):
        return actual.keys() == expected.keys() and all(_values_equal(actual[key], expected[key]) for key in actual)
    return actual == expected


def run_snapshot(task: ReplayTask, files: Mapping[str, str], image: str, timeout_seconds: int = 5,
                 split: Literal["development", "holdout", "all"] = "all") -> dict:
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 300:
        raise ValueError("Use a timeout from 1 through 300 seconds.")
    if split not in ("development", "holdout", "all"):
        raise ValueError("Select development, holdout, or all tests.")
    files = parse_replay_files(dict(files))
    frozen_task_hash = task_hash(task)
    selected = [test for test in task.tests if split == "all" or test.split == split]
    if not selected:
        raise ValueError("The selected split has no tests.")
    started = time.monotonic()
    try:
        endpoint = _docker_endpoint()
        image_id = _image_id(image, endpoint)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Cannot inspect the local Docker image.") from error
    protected_checks = [{"path": path, "status": "pass" if path in files and files[path] == task.snapshots.initial[path] else "fail"}
                        for path in task.protected_paths]
    rows = []
    cleanup_blocked = False
    expected_protected = {path: hashlib.sha256(task.snapshots.initial[path].encode()).hexdigest() for path in task.protected_paths}
    if all(check["status"] == "pass" for check in protected_checks):
        for test in selected:
            if cleanup_blocked:
                rows.append({"id": test.id, "split": test.split, "status": "inconclusive", "reason": "skipped-cleanup-blocked",
                             "wall_ms": 0.0, "stdout_sha256": None, "cleanup_confirmed": False, "container_name": None})
                continue
            name = "avalon-replay-" + uuid.uuid4().hex
            payload = json.dumps({"files": dict(files), "path": task.entrypoint.file, "function": task.entrypoint.function,
                                  "args": list(test.args), "kwargs": dict(test.kwargs), "protected_paths": list(task.protected_paths)},
                                 allow_nan=False, ensure_ascii=False).encode()
            test_started = time.monotonic()
            raw = b""
            status, reason = "inconclusive", "execution-error"
            try:
                code, raw, issue = _bounded_process(_docker_argv(image_id=image_id, name=name, endpoint=endpoint), payload, timeout_seconds)
                if issue:
                    reason = issue
                elif code:
                    reason = "process-exit"
                else:
                    try:
                        response = _parse_output(raw)
                        if response["protected"] != expected_protected:
                            status, reason = "fail", "reported-protected-change"
                        elif _values_equal(response["result"], test.expected):
                            status, reason = "pass", "matched"
                        else:
                            status, reason = "fail", "different"
                    except (ValueError, UnicodeDecodeError, RecursionError):
                        reason = "invalid-response"
            except OSError:
                reason = "process-start"
            finally:
                cleanup_confirmed = _remove_container(name, endpoint)
            if not cleanup_confirmed:
                cleanup_blocked = True
                status, reason = "inconclusive", "cleanup-unconfirmed"
            rows.append({"id": test.id, "split": test.split, "status": status, "reason": reason,
                         "wall_ms": (time.monotonic() - test_started) * 1000,
                         "stdout_sha256": hashlib.sha256(raw).hexdigest(), "cleanup_confirmed": cleanup_confirmed,
                         "container_name": None if cleanup_confirmed else name})
    if any(check["status"] == "fail" for check in protected_checks):
        rows = [{"id": test.id, "split": test.split, "status": "inconclusive", "reason": "skipped-protected-change",
                 "wall_ms": 0.0, "stdout_sha256": None, "cleanup_confirmed": True, "container_name": None}
                for test in selected]
        status = "fail"
    elif any(row["status"] == "inconclusive" for row in rows):
        status = "inconclusive"
    elif all(row["status"] == "pass" for row in rows):
        status = "pass"
    else:
        status = "fail"
    return {"format": "avalon.replay-receipt.v1", "status": status, "split": split, "task_hash": frozen_task_hash,
            "candidate_hash": _hash(dict(files)), "image_id": image_id, "protected_checks": protected_checks,
            "test_results": rows, "cleanup_blocked": cleanup_blocked, "wall_ms": (time.monotonic() - started) * 1000,
            "limits": [
                "The host compares returned JSON values. A candidate can forge its interpreter output.",
                "Protected snapshot checks run on the host. Reported runtime hashes are unauthenticated diagnostics.",
                "Output hashes cover captured stdout only. Timeout and output limits can truncate that capture.",
                "Booleans require matching types. Integers compare exactly. Arrays preserve order and objects match keys.",
                "Float comparisons use relative tolerance 1e-9 and absolute tolerance 1e-12 for arithmetic rounding.",
                "One run per selected test measures wall milliseconds including Docker startup and cleanup. Timing uncertainty is not estimated.",
                "No model calls occur. Local compute cost is not measured. This receipt establishes no training improvement.",
            ]}
