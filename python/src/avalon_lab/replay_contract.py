"""Parse bounded Avalon Replay tasks without executing candidate code."""
from __future__ import annotations

from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime
import hashlib
import json
import keyword
import math
import re
from typing import Literal, Mapping, TypeAlias, cast
from types import MappingProxyType

Json: TypeAlias = str | int | float | bool | None | list["Json"] | dict[str, "Json"]
Files: TypeAlias = Mapping[str, str]
FORMAT = "avalon.replay.v1"
MAX_TASK_BYTES = 10_485_760


@dataclass(frozen=True)
class Provenance:
    source: Literal["synthetic", "user"]
    model: str
    captured_at: str


@dataclass(frozen=True)
class RightsPrivate:
    status: Literal["private"] = "private"


@dataclass(frozen=True)
class RightsAuthorized:
    status: Literal["authorized"]
    owner: str
    allowed_uses: tuple[Literal["evaluation", "training", "redistribution"], ...]


@dataclass(frozen=True)
class Entrypoint:
    file: str
    function: str


@dataclass(frozen=True)
class Snapshots:
    initial: Files
    observed: Files
    reference: Files


@dataclass(frozen=True)
class TestCase:
    id: str
    split: Literal["development", "holdout"]
    args: tuple[Json, ...]
    kwargs: Mapping[str, Json]
    expected: Json


@dataclass(frozen=True)
class Control:
    id: str
    expect: Literal["pass", "fail"]
    files: Files


@dataclass(frozen=True)
class ReplayTask:
    format: str
    id: str
    family_id: str
    title: str
    description: str
    provenance: Provenance
    rights: RightsPrivate | RightsAuthorized
    entrypoint: Entrypoint
    snapshots: Snapshots
    tests: tuple[TestCase, ...]
    protected_paths: tuple[str, ...]
    controls: tuple[Control, ...]


def _object(value: object, keys: set[str] | None = None) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ValueError("Use an object with string keys.")
    if keys is not None and set(value) != keys:
        raise ValueError("Use all required fields and no additional fields.")
    return cast(dict[str, object], value)


def _text(value: object, limit: int = 8000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("Use nonempty text within the field limit.")
    return value


def _choice(value: object, choices: tuple[str, ...]) -> str:
    if not isinstance(value, str) or value not in choices:
        raise ValueError("Use a documented field value.")
    return value


def _identifier(value: object) -> str:
    text = _text(value, 120)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", text):
        raise ValueError("Use a portable identifier.")
    return text


def _path(value: object) -> str:
    text = _text(value, 240)
    for segment in text.split("/"):
        if (not re.fullmatch(r"[A-Za-z0-9._-]+", segment)
                or segment in {".", ".."} or segment.endswith(".")
                or segment.lower() in {"__proto__", "prototype", "constructor"}
                or re.match(r"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)", segment, re.I)):
            raise ValueError("Use a portable relative path without reserved segments.")
    return text


def _list(value: object, limit: int) -> list[object]:
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError("Use an array within the item limit.")
    return value


def _json(value: object, depth: int = 0) -> Json:
    if depth > 24:
        raise ValueError("Keep JSON nesting within 24 levels.")
    if value is None or isinstance(value, (bool, str)):
        if isinstance(value, str) and len(value) > 65_536:
            raise ValueError("Keep JSON strings within 65,536 characters.")
        return value
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError("Use integers within the exact JSON interoperability range.")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Use finite JSON numbers.")
        return value
    if isinstance(value, list):
        return [_json(item, depth + 1) for item in _list(value, 10_000)]
    if isinstance(value, dict):
        obj = _object(value)
        if len(obj) > 1000:
            raise ValueError("Keep JSON objects within 1000 fields.")
        return {key: _json(item, depth + 1) for key, item in obj.items()}
    raise ValueError("Use JSON values only.")


def _files(value: object) -> Files:
    obj = _object(value)
    if len(obj) > 100:
        raise ValueError("Use at most 100 files per snapshot.")
    files: dict[str, str] = {}
    for name, content in obj.items():
        path = _path(name)
        if not isinstance(content, str) or len(content) > 65_536:
            raise ValueError("Use text files with at most 65,536 characters.")
        files[path] = content
    lowered = [path.lower() for path in files]
    if len(set(lowered)) != len(lowered) or any(
        other.startswith(path + "/") for path in lowered for other in lowered
    ):
        raise ValueError("Use distinct file paths without directory collisions.")
    if sum(len(content.encode("utf-8")) for content in files.values()) > 1_048_576:
        raise ValueError("Keep each snapshot within 1 MiB.")
    return MappingProxyType(files)


def _timestamp(value: object) -> str:
    text = _text(value, 64)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Use an ISO timestamp with a timezone.") from error
    if "T" not in text or parsed.tzinfo is None:
        raise ValueError("Use an ISO timestamp with a timezone.")
    return text


def parse_replay_task(value: object) -> ReplayTask:
    """Validate and copy a task at the input boundary."""
    try:
        raw = json.dumps(value, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, RecursionError) as error:
        raise ValueError("Use a finite UTF-8 JSON task.") from error
    if len(raw) > MAX_TASK_BYTES:
        raise ValueError("Keep the task within 10 MiB of JSON.")
    obj = _object(value, {"format", "id", "family_id", "title", "description", "provenance", "rights", "entrypoint", "snapshots", "tests", "protected_paths", "controls"})
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
        parsed_rights = RightsAuthorized("authorized", _text(rights["owner"], 200), cast(tuple[Literal["evaluation", "training", "redistribution"], ...], uses))
    entry = _object(obj["entrypoint"], {"file", "function"})
    entry_file = _path(entry["file"])
    function = _text(entry["function"], 120)
    if not entry_file.endswith(".py") or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", function) or keyword.iskeyword(function):
        raise ValueError("Use a Python file and a valid function identifier.")
    snapshots = _object(obj["snapshots"], {"initial", "observed", "reference"})
    parsed_snapshots = Snapshots(*(_files(snapshots[name]) for name in ("initial", "observed", "reference")))
    if entry_file not in parsed_snapshots.initial:
        raise ValueError("Include the entrypoint in the initial snapshot.")
    protected = tuple(_path(path) for path in _list(obj["protected_paths"], 100))
    if len(set(path.lower() for path in protected)) != len(protected) or not all(path in parsed_snapshots.initial for path in protected):
        raise ValueError("Declare distinct protected paths that exist in the initial snapshot.")
    tests: list[TestCase] = []
    inputs: set[str] = set()
    for item in _list(obj["tests"], 32):
        test = _object(item, {"id", "split", "args", "kwargs", "expected"})
        args = tuple(_json(arg) for arg in _list(test["args"], 100))
        kwargs = {key: _json(arg) for key, arg in _object(test["kwargs"]).items()}
        if len(kwargs) > 100 or any(not key.isidentifier() or keyword.iskeyword(key) for key in kwargs):
            raise ValueError("Use at most 100 valid keyword arguments.")
        fingerprint = json.dumps([args, kwargs], sort_keys=True, separators=(",", ":"), allow_nan=False)
        if fingerprint in inputs:
            raise ValueError("Use distinct test inputs across development and holdout tests.")
        inputs.add(fingerprint)
        split = cast(Literal["development", "holdout"], _choice(test["split"], ("development", "holdout")))
        tests.append(TestCase(_identifier(test["id"]), split, args, kwargs, _json(test["expected"])))
    if {test.split for test in tests} != {"development", "holdout"} or len({test.id for test in tests}) != len(tests):
        raise ValueError("Include both test splits and distinct test identifiers.")
    controls: list[Control] = []
    for item in _list(obj["controls"], 8):
        control = _object(item, {"id", "expect", "files"})
        expectation = cast(Literal["pass", "fail"], _choice(control["expect"], ("pass", "fail")))
        controls.append(Control(_identifier(control["id"]), expectation, _files(control["files"])))
    if {control.expect for control in controls} != {"pass", "fail"} or len({control.id for control in controls}) != len(controls):
        raise ValueError("Include passing and failing controls with distinct identifiers.")
    return ReplayTask(FORMAT, _identifier(obj["id"]), _identifier(obj["family_id"]), _text(obj["title"], 200), _text(obj["description"]),
                      Provenance(source, _text(provenance["model"], 200), _timestamp(provenance["captured_at"])), parsed_rights,
                      Entrypoint(entry_file, function), parsed_snapshots, tuple(tests), protected, tuple(controls))


def task_to_dict(task: ReplayTask) -> dict[str, Json]:
    """Return an independent JSON representation of a parsed task."""
    return cast(dict[str, Json], _to_json(task))


def task_hash(task: ReplayTask) -> str:
    """Bind the complete task, including its checks and permissions."""
    content = json.dumps(task_to_dict(task), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _to_json(value: object) -> Json:
    if is_dataclass(value) and not isinstance(value, type):
        return {field.name: _to_json(getattr(value, field.name)) for field in fields(value)}
    if isinstance(value, Mapping):
        return {str(key): _to_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_json(item) for item in value]
    return _json(value)


def parse_files(value: object) -> Files:
    """Parse a bounded candidate snapshot without retaining mutable input aliases."""
    return _files(value)


def parse_replay_files(value: object) -> Files:
    """Parse a candidate snapshot through the shared file contract."""
    return parse_files(value)
