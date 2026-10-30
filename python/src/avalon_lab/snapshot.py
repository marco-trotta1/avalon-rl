"""The Python boundary for Avalon snapshots."""

from dataclasses import asdict, dataclass
import json
import math
import os
from pathlib import Path
from typing import Literal

import numpy as np

type Json = None | bool | int | float | str | list[Json] | dict[str, Json]
type Stage = Literal["source", "recorded", "learner"]
type Evidence = Literal["synthetic", "user-supplied"]
MAX_STEPS = 20_000
MAX_BYTES = 10 * 1024 * 1024


def json_value(value: object, *, path: str = "value") -> Json:
    """Convert supported NumPy values and reject lossy representations."""
    if isinstance(value, np.ndarray):
        return json_value(value.tolist(), path=path)
    if isinstance(value, np.generic):
        return json_value(value.item(), path=path)
    if type(value) is int and abs(value) > 2**53 - 1:
        raise ValueError(f"{path}: Use an integer within the exact JSON number range.")
    if value is None or isinstance(value, (bool, str, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{path}: Use a finite number.")
        return value
    if isinstance(value, (list, tuple)):
        return [json_value(item, path=f"{path}[{index}]") for index, item in enumerate(value)]
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError(f"{path}: Use string keys.")
        return {key: json_value(item, path=f"{path}.{key}") for key, item in value.items()}
    raise ValueError(f"{path}: Unsupported value type {type(value).__name__}.")


def reward_value(value: object, *, path: str) -> float:
    parsed = json_value(value, path=path)
    if type(parsed) not in (int, float):
        raise ValueError(f"{path}: Use a finite numeric reward.")
    return float(parsed)


@dataclass(frozen=True)
class Step:
    index: int
    observation: Json
    action: Json
    reward: float
    next_observation: Json
    terminated: bool
    truncated: bool
    bootstrap_mask: Literal[0, 1] | None = None


@dataclass(frozen=True)
class Episode:
    id: str
    task: str
    steps: tuple[Step, ...]
    metadata: dict[str, Json] | None = None


@dataclass(frozen=True)
class Snapshot:
    stage: Stage
    producer: dict[str, str]
    seed: int
    evidence: Evidence
    episodes: tuple[Episode, ...]

    def to_dict(self) -> dict[str, Json]:
        value = asdict(self)
        value["format"] = "avalon.snapshot/v1"
        for episode in value["episodes"]:
            if episode["metadata"] is None:
                del episode["metadata"]
            for step in episode["steps"]:
                if step["bootstrap_mask"] is None:
                    del step["bootstrap_mask"]
        return json_value(value)


def encode(snapshot: Snapshot) -> bytes:
    if type(snapshot.seed) is not int or not 0 <= snapshot.seed <= 0xFFFFFFFF:
        raise ValueError("Use a uint32 seed.")
    if snapshot.stage not in ("source", "recorded", "learner") or snapshot.evidence not in ("synthetic", "user-supplied"):
        raise ValueError("Use a documented stage and evidence label.")
    if not isinstance(snapshot.producer, dict) or set(snapshot.producer) != {"name", "version"} or not all(isinstance(value, str) and 1 <= len(value.strip()) <= 240 for value in snapshot.producer.values()):
        raise ValueError("Use valid producer labels.")
    if not snapshot.episodes or sum(len(episode.steps) for episode in snapshot.episodes) > MAX_STEPS:
        raise ValueError("Use 1 to 20,000 transitions.")
    for episode in snapshot.episodes:
        if not episode.steps or not all(isinstance(label, str) and 1 <= len(label.strip()) <= 240 for label in (episode.id, episode.task)):
            raise ValueError("Use nonempty episode labels and steps.")
        for step in episode.steps:
            if type(step.index) is not int or not 0 <= step.index <= MAX_STEPS:
                raise ValueError("Use a valid step index.")
            if type(step.reward) not in (float, int) or not math.isfinite(step.reward):
                raise ValueError("Use a finite reward.")
            if type(step.terminated) is not bool or type(step.truncated) is not bool:
                raise ValueError("Use boolean ending signals.")
            if step.bootstrap_mask is not None and (type(step.bootstrap_mask) is not int or step.bootstrap_mask not in (0, 1)):
                raise ValueError("Use bootstrap mask 0 or 1.")
        if episode.metadata is not None and (not isinstance(episode.metadata, dict) or not all(isinstance(key, str) and len(key) <= 240 for key in episode.metadata)):
            raise ValueError("Use a metadata object with valid keys.")
    payload = (json.dumps(snapshot.to_dict(), allow_nan=False, sort_keys=True, indent=2) + "\n").encode()
    if len(payload) > MAX_BYTES:
        raise ValueError("The snapshot exceeds 10 MiB.")
    return payload


def write_snapshot(path: Path, snapshot: Snapshot) -> None:
    """Create a private file and preserve existing files."""
    payload = encode(snapshot)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(payload)


def write_json(path: Path, value: object) -> None:
    payload = (json.dumps(json_value(value), allow_nan=False, sort_keys=True, indent=2) + "\n").encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(payload)


def read_snapshot(path: Path) -> Snapshot:
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("The snapshot exceeds 10 MiB.")
    value = json.loads(path.read_bytes())
    expected = {"format", "stage", "producer", "seed", "evidence", "episodes"}
    if not isinstance(value, dict) or set(value) != expected or value["format"] != "avalon.snapshot/v1":
        raise ValueError("Use the documented Avalon snapshot format.")
    try:
        episodes = tuple(Episode(
            id=episode["id"], task=episode["task"],
            steps=tuple(Step(**step) for step in episode["steps"]),
            **{key: item for key, item in episode.items() if key not in ("id", "task", "steps")},
        ) for episode in value["episodes"])
        snapshot = Snapshot(value["stage"], value["producer"], value["seed"], value["evidence"], episodes)
        encode(snapshot)
        return snapshot
    except (TypeError, KeyError, AttributeError) as error:
        raise ValueError("Use the documented Avalon snapshot format.") from error
