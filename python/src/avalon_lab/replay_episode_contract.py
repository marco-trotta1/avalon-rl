"""Parse frozen episode tasks without loading an environment or policy."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import keyword
import math
import re
from typing import Literal, Mapping, cast

from .replay_contract import (
    Control, Entrypoint, Json, MAX_TASK_BYTES, Provenance, RightsAuthorized,
    RightsPrivate, Snapshots, _choice, _identifier, _json, _list, _object,
    _path, _text, _timestamp, _to_json, parse_files,
)

FORMAT = "avalon.replay-episode.v1"


@dataclass(frozen=True)
class EnvironmentSpec:
    adapter: str
    id: str
    kwargs: Mapping[str, Json]


@dataclass(frozen=True)
class EpisodeSpec:
    id: str
    split: Literal["development", "holdout"]
    seed: int


@dataclass(frozen=True)
class EpisodeTask:
    format: str
    id: str
    title: str
    description: str
    provenance: Provenance
    rights: RightsPrivate | RightsAuthorized
    environment: EnvironmentSpec
    policy: Entrypoint
    snapshots: Snapshots
    controls: tuple[Control, ...]
    episodes: tuple[EpisodeSpec, ...]
    max_steps: int
    min_return: float


def parse_episode_task(value: object) -> EpisodeTask:
    """Validate and copy an episode task at the input boundary."""
    try:
        encoded = json.dumps(value, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, RecursionError) as error:
        raise ValueError("Use a finite UTF-8 JSON task.") from error
    if len(encoded) > MAX_TASK_BYTES:
        raise ValueError("Keep the episode task within 10 MiB of JSON.")
    obj = _object(value, {"format", "id", "title", "description", "provenance", "rights", "environment", "policy", "snapshots", "controls", "episodes", "max_steps", "min_return"})
    _choice(obj["format"], (FORMAT,))
    provenance = _object(obj["provenance"], {"source", "model", "captured_at"})
    source = cast(Literal["synthetic", "user"], _choice(provenance["source"], ("synthetic", "user")))
    rights = _object(obj["rights"])
    status = _choice(rights.get("status"), ("private", "authorized"))
    parsed_rights: RightsPrivate | RightsAuthorized
    if status == "private":
        _object(rights, {"status"})
        parsed_rights = RightsPrivate()
    else:
        _object(rights, {"status", "owner", "allowed_uses"})
        uses = tuple(_choice(use, ("evaluation", "training", "redistribution")) for use in _list(rights["allowed_uses"], 3))
        if not uses or len(set(uses)) != len(uses):
            raise ValueError("Declare each permitted use once.")
        parsed_rights = RightsAuthorized("authorized", _text(rights["owner"], 200),
            cast(tuple[Literal["evaluation", "training", "redistribution"], ...], uses))
    environment = _object(obj["environment"], {"adapter", "id", "kwargs"})
    kwargs = cast(dict[str, Json], _json(_object(environment["kwargs"])))
    parsed_environment = EnvironmentSpec(_identifier(environment["adapter"]), _text(environment["id"], 200), kwargs)
    policy = _object(obj["policy"], {"file", "function"})
    policy_file = _path(policy["file"])
    function = _text(policy["function"], 120)
    if not policy_file.endswith(".py") or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", function) or keyword.iskeyword(function):
        raise ValueError("Use a Python policy file and a valid function identifier.")
    snapshots = _object(obj["snapshots"], {"initial", "observed", "reference"})
    parsed_snapshots = Snapshots(*(parse_files(snapshots[name]) for name in ("initial", "observed", "reference")))
    if policy_file not in parsed_snapshots.initial:
        raise ValueError("Include the policy file in the initial snapshot.")
    episodes: list[EpisodeSpec] = []
    for item in _list(obj["episodes"], 12):
        episode = _object(item, {"id", "split", "seed"})
        seed = episode["seed"]
        if type(seed) is not int or not 0 <= seed <= 0xffffffff:
            raise ValueError("Use an unsigned 32-bit integer seed.")
        split = cast(Literal["development", "holdout"], _choice(episode["split"], ("development", "holdout")))
        episodes.append(EpisodeSpec(_identifier(episode["id"]), split, seed))
    if {episode.split for episode in episodes} != {"development", "holdout"}:
        raise ValueError("Include development and holdout episodes.")
    if len({episode.id for episode in episodes}) != len(episodes) or len({episode.seed for episode in episodes}) != len(episodes):
        raise ValueError("Use distinct episode identifiers and seeds across both splits.")
    controls: list[Control] = []
    for item in _list(obj["controls"], 4):
        control = _object(item, {"id", "expect", "files"})
        expectation = cast(Literal["pass", "fail"], _choice(control["expect"], ("pass", "fail")))
        controls.append(Control(_identifier(control["id"]), expectation, parse_files(control["files"])))
    if {control.expect for control in controls} != {"pass", "fail"} or len({control.id for control in controls}) != len(controls):
        raise ValueError("Include passing and failing controls with distinct identifiers.")
    max_steps = obj["max_steps"]
    if type(max_steps) is not int or not 1 <= max_steps <= 500:
        raise ValueError("Use an integer step limit from 1 through 500.")
    min_return = obj["min_return"]
    if type(min_return) not in (int, float):
        raise ValueError("Use a finite numeric return threshold.")
    try:
        threshold = float(min_return)
    except OverflowError as error:
        raise ValueError("Use a finite numeric return threshold.") from error
    if not math.isfinite(threshold):
        raise ValueError("Use a finite numeric return threshold.")
    return EpisodeTask(FORMAT, _identifier(obj["id"]), _text(obj["title"], 200), _text(obj["description"]),
        Provenance(source, _text(provenance["model"], 200), _timestamp(provenance["captured_at"])), parsed_rights,
        parsed_environment, Entrypoint(policy_file, function), parsed_snapshots, tuple(controls), tuple(episodes), max_steps, threshold)


def episode_task_to_dict(task: EpisodeTask) -> dict[str, Json]:
    """Return an independent JSON representation of the task."""
    return cast(dict[str, Json], _to_json(task))


def episode_task_hash(task: EpisodeTask) -> str:
    """Bind the adapter, policy evidence, seeds, limits, and permissions."""
    content = json.dumps(episode_task_to_dict(task), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
