"""Check explicit project inputs and frozen benchmark identity."""
from dataclasses import FrozenInstanceError

import pytest

from avalon_lab.replay_project_contract import benchmark_hash, parse_project, project_hash, project_to_dict
from avalon_lab.replay_project_demo import project_demo


def test_roundtrip_preserves_project_and_benchmark_identity():
    project = project_demo()
    rebuilt = parse_project(project_to_dict(project))
    assert project_to_dict(rebuilt) == project_to_dict(project)
    assert project_hash(rebuilt) == project_hash(project)
    assert benchmark_hash(rebuilt) == benchmark_hash(project)


@pytest.mark.parametrize("field,value", [
    ("brief", "Evaluate another stated use of this frozen task."),
    ("assumptions", ["The stated task is an authored simulation."]),
    ("split_rationale", "This narrative changes, but the declared task remains fixed."),
    ("context", {"notes.txt": "Additional supplied context."}),
])
def test_narrative_changes_do_not_change_benchmark_identity(field, value):
    project = project_demo()
    data = project_to_dict(project)
    data[field] = value
    changed = parse_project(data)
    assert project_hash(changed) != project_hash(project)
    assert benchmark_hash(changed) == benchmark_hash(project)


def test_world_and_task_changes_change_benchmark_identity():
    project = project_demo()
    data = project_to_dict(project)
    data["world"]["files"]["world.py"] += "\n# Revised world.\n"
    assert benchmark_hash(parse_project(data)) != benchmark_hash(project)
    data = project_to_dict(project)
    data["task"]["min_return"] = 1.5
    assert benchmark_hash(parse_project(data)) != benchmark_hash(project)


def test_project_is_immutable_and_copies_supplied_files():
    data = project_to_dict(project_demo())
    project = parse_project(data)
    data["world"]["files"]["world.py"] = "changed"
    assert project.world.files["world.py"] != "changed"
    with pytest.raises(TypeError):
        project.world.files["world.py"] = "changed"
    with pytest.raises(TypeError):
        project.context["new.txt"] = "changed"
    with pytest.raises(TypeError):
        project.task.environment.kwargs["new"] = True
    with pytest.raises(FrozenInstanceError):
        project.brief = "changed"


@pytest.mark.parametrize("field,value", [
    ("brief", ""), ("brief", "x" * 20_001), ("assumptions", []),
    ("assumptions", ["x"] * 21), ("assumptions", ["x" * 1001]),
    ("split_rationale", ""), ("split_rationale", "x" * 4001),
])
def test_bounds_project_narrative(field, value):
    data = project_to_dict(project_demo())
    data[field] = value
    with pytest.raises(ValueError):
        parse_project(data)


@pytest.mark.parametrize("adapter,kwargs", [("gymnasium", {}), ("python-world", {"load": "module"})])
def test_requires_explicit_world_adapter_without_options(adapter, kwargs):
    data = project_to_dict(project_demo())
    data["task"]["environment"]["adapter"] = adapter
    data["task"]["environment"]["kwargs"] = kwargs
    with pytest.raises(ValueError):
        parse_project(data)


@pytest.mark.parametrize("entrypoint", [
    {"file": "../world.py", "function": "act"},
    {"file": "missing.py", "function": "act"},
    {"file": "world.py", "function": "class"},
    {"file": "world.txt", "function": "act"},
])
def test_rejects_invalid_world_entrypoints(entrypoint):
    data = project_to_dict(project_demo())
    data["world"]["entrypoint"] = entrypoint
    with pytest.raises(ValueError):
        parse_project(data)


@pytest.mark.parametrize("field", ["context", "world"])
def test_rejects_unsafe_explicit_assets(field):
    data = project_to_dict(project_demo())
    if field == "context":
        data[field] = {"../secret": "x"}
    else:
        data[field]["files"]["../secret"] = "x"
    with pytest.raises(ValueError):
        parse_project(data)


def test_rejects_extra_fields_and_missing_context():
    data = project_to_dict(project_demo())
    data["repository"] = "/private/project"
    with pytest.raises(ValueError):
        parse_project(data)
    data = project_to_dict(project_demo())
    del data["context"]
    with pytest.raises(ValueError):
        parse_project(data)


def test_demo_declares_authored_evidence_and_repeated_scenarios():
    project = project_demo()
    assert project.task.provenance.source == "synthetic"
    assert project.task.rights.status == "private"
    assert "repeat across splits" in project.split_rationale
    development = {episode.seed % 2 for episode in project.task.episodes if episode.split == "development"}
    holdout = {episode.seed % 2 for episode in project.task.episodes if episode.split == "holdout"}
    assert development == holdout == {0, 1}
