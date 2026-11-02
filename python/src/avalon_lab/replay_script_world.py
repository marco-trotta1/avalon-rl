"""Run a reviewed Python world in a container separate from the policy."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Literal

from .replay_actor import ActorError, DockerPolicySession, _json_value
from .replay_adapters import Transition
from .replay_contract import Json
from .replay_runner import _hash

if TYPE_CHECKING:
    from .replay_project_contract import WorldSpec


class WorldCleanupError(RuntimeError):
    """Retain cleanup evidence when a world container cannot be removed."""

    def __init__(self, receipt: dict):
        self.receipt = dict(receipt)
        self.receipt["cleanup_blocked"] = True
        self.cleanup_blocked = True
        self.container_name = self.receipt.get("container_name")
        super().__init__("World cleanup remains unconfirmed.")


class ScriptWorldAdapter:
    """Use one isolated world process for one episode."""

    def __init__(self, world: WorldSpec, *, image: str, max_steps: int, timeout_seconds: int = 5):
        if type(max_steps) is not int or not 1 <= max_steps <= 500:
            raise ValueError("Use a step budget from one through 500.")
        self.max_steps = max_steps
        self.steps = 0
        self._state: Literal["needs-reset", "ready", "done", "closed"] = "needs-reset"
        self._close_receipt: dict | None = None
        self.world_hash = _hash({"files": dict(world.files), "entrypoint": {
            "file": world.entrypoint.file, "function": world.entrypoint.function,
        }})
        self._session = DockerPolicySession(
            files=world.files, entrypoint_file=world.entrypoint.file, function=world.entrypoint.function,
            image=image, timeout_seconds=timeout_seconds, max_actions=max_steps + 1, episode_timeout_seconds=60,
        )
        try:
            self._session.start()
        except Exception:
            self.close()
            raise

    def _request(self, value: Json, *, keys: set[str]) -> dict:
        try:
            response = _json_value(self._session.act(value))
            if not isinstance(response, dict) or set(response) != keys:
                raise ActorError("world-protocol")
            return response
        except Exception:
            self.close()
            raise

    def reset(self, *, seed: int) -> Json:
        if self._state != "needs-reset":
            raise RuntimeError("Create a fresh world adapter for each episode.")
        if type(seed) is not int or not 0 <= seed <= 0xffffffff:
            raise ValueError("Use an unsigned 32-bit integer seed.")
        response = self._request({"op": "reset", "seed": seed}, keys={"observation"})
        self._state = "ready"
        return response["observation"]

    def step(self, action: Json) -> Transition:
        if self._state != "ready":
            raise RuntimeError("Reset the world before taking another action.")
        response = self._request({"op": "step", "action": action},
                                 keys={"observation", "reward", "terminated", "truncated"})
        try:
            reward = response["reward"]
            if type(reward) not in (int, float) or not math.isfinite(reward):
                raise ActorError("world-protocol")
            terminated, truncated = response["terminated"], response["truncated"]
            if type(terminated) is not bool or type(truncated) is not bool:
                raise ActorError("world-protocol")
            self.steps += 1
            truncated = truncated or (self.steps >= self.max_steps and not terminated)
            self._state = "done" if terminated or truncated else "ready"
            return Transition(response["observation"], float(reward), terminated, truncated)
        except Exception:
            self.close()
            raise

    def metadata(self) -> dict[str, object]:
        return {
            "adapter": "python-world", "protocol": "avalon.script-world.v1", "world_hash": self.world_hash,
            "world_files_hash": self._session.candidate_hash, "image_id": self._session.image_id,
            "max_steps": self.max_steps, "world_lifetime_seconds": 60,
            "reward_authority": "isolated-world-process",
            "limits": [
                "The world runs separately from the policy. The world code defines rewards and ending flags.",
                "World isolation does not establish correct rewards or faithful simulation. Review the frozen world and controls.",
                "The world receives the reset seed. The policy receives the returned observation only.",
            ],
        }

    def close(self) -> None:
        self._state = "closed"
        if self._close_receipt is None:
            try:
                self._close_receipt = dict(self._session.close())
            except Exception as error:
                self._close_receipt = {"cleanup_blocked": True, "container_name": None}
                raise WorldCleanupError(self._close_receipt) from error
        if self._close_receipt.get("cleanup_blocked"):
            raise WorldCleanupError(self._close_receipt)
