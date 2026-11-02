"""A one-step coding environment that uses development tests only."""

import json
from typing import Literal

import gymnasium as gym
from gymnasium import spaces

from .replay_contract import ReplayTask, parse_replay_task, task_hash, task_to_dict
from .replay_runner import run_snapshot


class ReplayEnvironment(gym.Env[str, str]):
    """Accept replacement code for one entrypoint, then grade development behavior."""

    metadata = {"render_modes": []}

    def __init__(self, *, task: ReplayTask, image: str = "python:3.11.15-slim", timeout_seconds: int = 5):
        super().__init__()
        if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 60:
            raise ValueError("Set the timeout between one and sixty seconds.")
        if not isinstance(image, str) or not image.strip() or image.startswith("-") or len(image) > 300:
            raise ValueError("Supply a local Docker image name or digest.")
        self.task = parse_replay_task(task_to_dict(task))
        self.image = image
        self.timeout_seconds = timeout_seconds
        fixed_bytes = sum(len(content.encode("utf-8")) for path, content in self.task.snapshots.initial.items()
                          if path != self.task.entrypoint.file)
        self.action_space = spaces.Text(max_length=min(65_536, 1_048_576 - fixed_bytes), min_length=0,
                                        charset="".join(chr(i) for i in range(128)))
        self._initial_observation = json.dumps({
            "description": self.task.description,
            "entrypoint": {"file": self.task.entrypoint.file, "function": self.task.entrypoint.function},
            "initial_files": dict(self.task.snapshots.initial),
        }, ensure_ascii=True)
        self.observation_space = spaces.Text(max_length=max(256, len(self._initial_observation)), min_length=0,
                                             charset="".join(chr(i) for i in range(128)))
        self._state: Literal["needs-reset", "ready", "done", "cleanup-blocked"] = "needs-reset"

    def reset(self, *, seed: int | None = None, options: dict[str, object] | None = None) -> tuple[str, dict[str, object]]:
        if self._state == "cleanup-blocked":
            raise RuntimeError("Confirm cleanup of the receipt containers, then create a new environment.")
        super().reset(seed=seed)
        self._state = "ready"
        return self._initial_observation, {"task_hash": task_hash(self.task), "split": "development"}

    def step(self, action: str) -> tuple[str, float, bool, bool, dict[str, object]]:
        if self._state != "ready":
            raise RuntimeError("Reset the environment before each candidate.")
        if not self.action_space.contains(action):
            raise ValueError("Supply bounded ASCII Python source.")
        self._state = "done"
        candidate = dict(self.task.snapshots.initial)
        candidate[self.task.entrypoint.file] = action
        try:
            receipt = run_snapshot(task=self.task, files=candidate, image=self.image,
                                   timeout_seconds=self.timeout_seconds, split="development")
        except (OSError, RuntimeError):
            receipt = {"status": "inconclusive", "split": "development", "task_hash": task_hash(self.task),
                       "reason": "The execution runtime is unavailable."}
        if receipt.get("cleanup_blocked") is True:
            self._state = "cleanup-blocked"
        inconclusive = receipt["status"] == "inconclusive" or self._state == "cleanup-blocked"
        reward = 1.0 if receipt["status"] == "pass" and not inconclusive else 0.0
        observation = json.dumps({"status": receipt["status"], "split": "development"})
        return observation, reward, not inconclusive, inconclusive, {"receipt": receipt}
