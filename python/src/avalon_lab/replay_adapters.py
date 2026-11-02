"""Trusted world adapters keep rewards outside the candidate policy process."""

from dataclasses import dataclass
import hashlib
import inspect
import math
from pathlib import Path
from typing import Protocol

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from gymnasium.envs.classic_control import CartPoleEnv, MountainCarEnv, PendulumEnv
from gymnasium.envs.toy_text import FrozenLakeEnv, TaxiEnv

from .replay_contract import Json
from .replay_episode_contract import EnvironmentSpec
from .snapshot import json_value

BUILTIN_WORLDS = ("CartPole-v1", "FrozenLake-v1", "Taxi-v3", "Pendulum-v1", "MountainCar-v0")


@dataclass(frozen=True)
class Transition:
    observation: Json
    reward: float
    terminated: bool
    truncated: bool


class EnvironmentAdapter(Protocol):
    """Implement this interface in trusted code to supply another world."""

    def reset(self, *, seed: int) -> Json: ...
    def step(self, action: Json) -> Transition: ...
    def close(self) -> None: ...
    def metadata(self) -> dict[str, object]: ...


def _numeric(value: object) -> bool:
    if type(value) in (int, float):
        try:
            return math.isfinite(value)
        except OverflowError:
            return False
    return isinstance(value, list) and all(_numeric(item) for item in value)


class GymnasiumAdapter:
    """Run explicit built-in constructors without using the mutable Gym registry."""

    def __init__(self, spec: EnvironmentSpec, *, max_steps: int):
        if type(max_steps) is not int or not 1 <= max_steps <= 500:
            raise ValueError("Use a step budget from one through 500.")
        options = dict(spec.kwargs)
        if spec.id == "FrozenLake-v1":
            if set(options) - {"map_name", "is_slippery"}:
                raise ValueError("Use only the documented FrozenLake options.")
            map_name = options.get("map_name", "4x4")
            slippery = options.get("is_slippery", True)
            if map_name not in ("4x4", "8x8") or type(slippery) is not bool:
                raise ValueError("Select a supported map and a boolean slippery option.")
            environment = FrozenLakeEnv(map_name=map_name, is_slippery=slippery)
        else:
            if options:
                raise ValueError("This built-in world does not accept options.")
            constructors = {"CartPole-v1": CartPoleEnv, "Taxi-v3": TaxiEnv,
                            "Pendulum-v1": PendulumEnv, "MountainCar-v0": MountainCarEnv}
            if spec.id not in constructors:
                raise ValueError("Select a supported built-in world or supply a trusted adapter factory.")
            environment = constructors[spec.id]()
        self.environment = environment
        self.spec = spec
        self.max_steps = max_steps
        self.steps = 0
        self.ready = False
        source = Path(inspect.getfile(type(environment)))
        self.source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

    def reset(self, *, seed: int) -> Json:
        observation, _ = self.environment.reset(seed=seed)
        self.steps = 0
        self.ready = True
        return json_value(observation)

    def step(self, action: Json) -> Transition:
        if not self.ready:
            raise RuntimeError("Reset the world before taking another action.")
        space = self.environment.action_space
        if isinstance(space, spaces.Discrete):
            if type(action) is not int or not space.contains(action):
                raise ValueError("Supply an integer action within the world bounds.")
            checked_action = action
        elif isinstance(space, spaces.Box):
            if not _numeric(action):
                raise ValueError("Supply finite numeric control values.")
            raw_action = np.asarray(action, dtype=np.float64)
            if raw_action.shape != space.shape or np.any(raw_action < space.low) or np.any(raw_action > space.high):
                raise ValueError("Supply a control with the required shape and bounds.")
            checked_action = raw_action.astype(space.dtype)
            if not space.contains(checked_action):
                raise ValueError("Supply a control with the required shape and bounds.")
        else:
            raise ValueError("This built-in adapter does not support the action space.")
        observation, reward, terminated, truncated, _ = self.environment.step(checked_action)
        if not math.isfinite(float(reward)):
            raise ValueError("The world returns a non-finite reward.")
        self.steps += 1
        ended = bool(terminated)
        cut = bool(truncated) or (self.steps >= self.max_steps and not ended)
        self.ready = not (ended or cut)
        return Transition(json_value(observation), float(reward), ended, cut)

    def metadata(self) -> dict[str, object]:
        return {"adapter": "gymnasium", "environment": self.spec.id, "kwargs": dict(self.spec.kwargs),
                "gymnasium": gym.__version__, "numpy": np.__version__, "source_sha256": self.source_hash,
                "max_steps": self.max_steps, "reward_authority": "trusted-host-world"}

    def close(self) -> None:
        self.ready = False
        self.environment.close()


def create_adapter(spec: EnvironmentSpec, *, max_steps: int) -> EnvironmentAdapter:
    if spec.adapter != "gymnasium":
        raise ValueError("The command supports gymnasium. Supply other adapters through the trusted Python API.")
    return GymnasiumAdapter(spec, max_steps=max_steps)
