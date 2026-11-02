"""Behavioral checks for the Replay task boundary."""
from copy import deepcopy
import math

import pytest

from avalon_lab.replay_contract import parse_files, parse_replay_task, task_hash, task_to_dict


def manifest():
    initial = {"solution.py": "def add(a, b):\n    return a - b\n", "config.json": "{}\n"}
    reference = {**initial, "solution.py": "def add(a, b):\n    return a + b\n"}
    return {
        "format": "avalon.replay.v1", "id": "addition", "family_id": "arithmetic", "title": "Repair addition",
        "description": "Add two numbers and preserve the configuration.",
        "provenance": {"source": "synthetic", "model": "authored-control", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"}, "entrypoint": {"file": "solution.py", "function": "add"},
        "snapshots": {"initial": initial, "observed": initial, "reference": reference},
        "protected_paths": ["config.json"],
        "tests": [
            {"id": "dev", "split": "development", "args": [2, 3], "kwargs": {}, "expected": 5},
            {"id": "holdout", "split": "holdout", "args": [-2, 3], "kwargs": {}, "expected": 1},
        ],
        "controls": [{"id": "valid", "expect": "pass", "files": reference}, {"id": "invalid", "expect": "fail", "files": initial}],
    }


def test_roundtrip_preserves_evidence_and_binds_rights():
    task = parse_replay_task(manifest())
    assert task_to_dict(task) == manifest()
    assert task_hash(parse_replay_task(task_to_dict(task))) == task_hash(task)
    authorized = manifest()
    authorized["rights"] = {"status": "authorized", "owner": "Example owner", "allowed_uses": ["evaluation"]}
    assert task_hash(parse_replay_task(authorized)) != task_hash(task)


def test_hash_ignores_mapping_insertion_order():
    data = manifest()
    reordered = dict(reversed(list(data.items())))
    reordered["snapshots"] = {name: dict(reversed(list(files.items()))) for name, files in data["snapshots"].items()}
    assert task_hash(parse_replay_task(data)) == task_hash(parse_replay_task(reordered))


def test_snapshot_is_copied_and_immutable():
    data = manifest()
    task = parse_replay_task(data)
    data["snapshots"]["initial"]["solution.py"] = "changed"
    assert task.snapshots.initial["solution.py"] != "changed"
    with pytest.raises(TypeError):
        task.snapshots.initial["solution.py"] = "changed"
    exported = task_to_dict(task)
    exported["snapshots"]["initial"]["solution.py"] = "changed"
    assert task.snapshots.initial["solution.py"] != "changed"


@pytest.mark.parametrize("path", ["../x", "/x", "a\\b", "a//b", "a/../b", "a.", "NUL.txt", "__proto__/x", "a:b"])
def test_rejects_unsafe_paths(path):
    with pytest.raises(ValueError):
        parse_files({path: "content"})


@pytest.mark.parametrize("files", [{"A": "x", "a/b": "y"}, {"A": "x", "a": "y"}, {"x": "a" * 65_537}])
def test_rejects_collisions_and_oversized_content(files):
    with pytest.raises(ValueError):
        parse_files(files)


def test_accepts_dotfiles_and_empty_file_contents():
    assert dict(parse_files({".gitignore": "", "src/.keep": ""})) == {".gitignore": "", "src/.keep": ""}


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf"), 2**54])
def test_rejects_nonportable_numbers(value):
    data = manifest()
    data["tests"][0]["expected"] = value
    with pytest.raises(ValueError):
        parse_replay_task(data)


def test_rejects_duplicate_inputs_and_missing_splits():
    for change in ("inputs", "split", "id"):
        data = manifest()
        if change == "inputs":
            data["tests"][1]["args"] = deepcopy(data["tests"][0]["args"])
        else:
            data["tests"][1][change] = data["tests"][0][change]
        with pytest.raises(ValueError):
            parse_replay_task(data)


def test_rejects_missing_controls_and_protected_files():
    for field, value in [("controls", []), ("controls", manifest()["controls"][:1]), ("protected_paths", ["missing"]), ("protected_paths", ["config.json", "config.json"])]:
        data = manifest()
        data[field] = value
        with pytest.raises(ValueError):
            parse_replay_task(data)


def test_rejects_unknown_fields_and_invalid_permissions():
    data = manifest()
    data["extra"] = True
    with pytest.raises(ValueError):
        parse_replay_task(data)
    for rights in ({"status": "private", "owner": "x"}, {"status": "authorized"}, {"status": "authorized", "owner": "x", "allowed_uses": []}):
        data = manifest()
        data["rights"] = rights
        with pytest.raises(ValueError):
            parse_replay_task(data)


@pytest.mark.parametrize("date", ["yesterday", "2026-11-01", "2026-11-01T00:00:00", "2026-19-01T00:00:00Z"])
def test_requires_timestamp_timezone(date):
    data = manifest()
    data["provenance"]["captured_at"] = date
    with pytest.raises(ValueError):
        parse_replay_task(data)


def test_requires_python_entrypoint_and_finite_limits():
    for entry in ({"file": "solution.txt", "function": "add"}, {"file": "solution.py", "function": "class"}, {"file": "missing.py", "function": "add"}):
        data = manifest()
        data["entrypoint"] = entry
        with pytest.raises(ValueError):
            parse_replay_task(data)
    for field, multiplier in [("tests", 17), ("controls", 5)]:
        data = manifest()
        data[field] *= multiplier
        with pytest.raises(ValueError):
            parse_replay_task(data)


def test_copies_nested_test_inputs_and_expected_outputs():
    data = manifest()
    data["tests"][0]["args"] = [{"rows": [1, 2]}]
    data["tests"][0]["expected"] = {"result": [3]}
    task = parse_replay_task(data)
    data["tests"][0]["args"][0]["rows"].append(4)
    data["tests"][0]["expected"]["result"].append(5)
    assert task.tests[0].args == ({"rows": [1, 2]},)
    assert task.tests[0].expected == {"result": [3]}


def test_bounds_snapshot_file_count_and_total_bytes():
    for files in ({f"file-{index}": "" for index in range(101)}, {f"file-{index}": "x" * 65_536 for index in range(17)}):
        with pytest.raises(ValueError):
            parse_files(files)


def test_rejects_nested_extra_fields_and_duplicate_permissions():
    data = manifest()
    data["tests"][0]["execute"] = "forbidden"
    with pytest.raises(ValueError):
        parse_replay_task(data)
    data = manifest()
    data["rights"] = {"status": "authorized", "owner": "Example owner", "allowed_uses": ["evaluation", "evaluation"]}
    with pytest.raises(ValueError):
        parse_replay_task(data)
