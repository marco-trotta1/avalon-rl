"""Parse explicit project evidence and bind a frozen world benchmark."""
from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
import keyword
import re
from types import MappingProxyType
from typing import cast

from .replay_contract import Entrypoint, Files, Json, MAX_TASK_BYTES, _list, _object, _path, _text, _to_json, parse_files
from .replay_episode_contract import EpisodeTask, episode_task_to_dict, parse_episode_task

FORMAT = "avalon.replay-project.v1"


@dataclass(frozen=True)
class WorldSpec:
    files: Files
    entrypoint: Entrypoint


@dataclass(frozen=True)
class Project:
    format: str
    brief: str
    assumptions: tuple[str, ...]
    split_rationale: str
    task: EpisodeTask
    world: WorldSpec
    context: Files


def parse_project(value: object) -> Project:
    """Copy explicit project inputs without discovering local files."""
    try:
        encoded = json.dumps(value, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, RecursionError) as error:
        raise ValueError("Use a finite UTF-8 JSON project.") from error
    if len(encoded) > MAX_TASK_BYTES:
        raise ValueError("Keep the project within 10 MiB of JSON.")
    obj = _object(value, {"format", "brief", "assumptions", "split_rationale", "task", "world", "context"})
    if obj["format"] != FORMAT:
        raise ValueError("Use the documented Replay project format.")
    assumptions = tuple(_text(item, 1000) for item in _list(obj["assumptions"], 20))
    if not assumptions:
        raise ValueError("Declare at least one project assumption.")
    task = parse_episode_task(obj["task"])
    if task.environment.adapter != "python-world" or task.environment.kwargs:
        raise ValueError("Use the python-world adapter with an empty configuration object.")
    task = replace(task, environment=replace(task.environment, kwargs=MappingProxyType({})))
    world = _object(obj["world"], {"files", "entrypoint"})
    files = parse_files(world["files"])
    entrypoint = _object(world["entrypoint"], {"file", "function"})
    file = _path(entrypoint["file"])
    function = _text(entrypoint["function"], 120)
    if not file.endswith(".py") or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", function) or keyword.iskeyword(function):
        raise ValueError("Use a Python world file and a valid function identifier.")
    if file not in files:
        raise ValueError("Include the world entrypoint in the world files.")
    return Project(FORMAT, _text(obj["brief"], 20_000), assumptions, _text(obj["split_rationale"], 4000),
                   task, WorldSpec(files, Entrypoint(file, function)), parse_files(obj["context"]))


def project_to_dict(project: Project) -> dict[str, Json]:
    """Return an independent JSON representation of the project."""
    return cast(dict[str, Json], _to_json(project))


def _hash(value: Json) -> str:
    content = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def project_hash(project: Project) -> str:
    """Bind the complete project, including supplied context and assumptions."""
    return _hash(project_to_dict(project))


def benchmark_hash(project: Project) -> str:
    """Bind the task and world independently of the narrative and context."""
    return _hash({"task": episode_task_to_dict(project.task), "world": _to_json(project.world)})
