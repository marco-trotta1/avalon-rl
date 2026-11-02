"""Check episode task boundaries without loading a world or policy."""
import pytest

from avalon_lab.replay_episode_contract import (
    episode_task_hash, episode_task_to_dict, parse_episode_task,
)


def manifest():
    initial = {"policy.py": "def act(observation):\n    return 0\n"}
    reference = {"policy.py": "def act(observation):\n    return int(observation[2] > 0)\n"}
    return {
        "format": "avalon.replay-episode.v1", "id": "balance-pole", "title": "Keep the pole balanced",
        "description": "Select actions from the observation and keep the pole balanced.",
        "provenance": {"source": "synthetic", "model": "authored-control", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"},
        "environment": {"adapter": "gymnasium", "id": "CartPole-v1", "kwargs": {}},
        "policy": {"file": "policy.py", "function": "act"},
        "snapshots": {"initial": initial, "observed": initial, "reference": reference},
        "controls": [{"id": "valid", "expect": "pass", "files": reference}, {"id": "invalid", "expect": "fail", "files": initial}],
        "episodes": [{"id": "dev", "split": "development", "seed": 7}, {"id": "held", "split": "holdout", "seed": 19}],
        "max_steps": 200, "min_return": 100.0,
    }


def test_roundtrip_preserves_frozen_experiment():
    task = parse_episode_task(manifest())
    assert episode_task_to_dict(task) == manifest()
    assert episode_task_hash(parse_episode_task(episode_task_to_dict(task))) == episode_task_hash(task)


def test_hash_binds_adapter_seeds_threshold_and_permissions():
    base = episode_task_hash(parse_episode_task(manifest()))
    changes = [
        ("environment", {"adapter": "custom", "id": "world", "kwargs": {"gravity": 5}}),
        ("episodes", [{"id": "dev", "split": "development", "seed": 41}, {"id": "held", "split": "holdout", "seed": 19}]),
        ("min_return", 150.0),
        ("rights", {"status": "authorized", "owner": "Example owner", "allowed_uses": ["evaluation"]}),
    ]
    for field, value in changes:
        data = manifest()
        data[field] = value
        assert episode_task_hash(parse_episode_task(data)) != base


def test_hash_ignores_mapping_insertion_order():
    data = manifest()
    assert episode_task_hash(parse_episode_task(dict(reversed(list(data.items()))))) == episode_task_hash(parse_episode_task(data))


def test_contract_does_not_load_or_restrict_adapter_names():
    data = manifest()
    data["environment"] = {"adapter": "external-world", "id": "Robotics/Example-v1", "kwargs": {"layout": [1, 2]}}
    task = parse_episode_task(data)
    assert task.environment.adapter == "external-world"
    data["environment"]["kwargs"]["layout"].append(3)
    assert task.environment.kwargs["layout"] == [1, 2]
    exported = episode_task_to_dict(task)
    exported["environment"]["kwargs"]["layout"].append(4)
    assert task.environment.kwargs["layout"] == [1, 2]


@pytest.mark.parametrize("seed", [-1, 2**32, True, 7.0, "7"])
def test_rejects_non_uint32_seeds(seed):
    data = manifest()
    data["episodes"][0]["seed"] = seed
    with pytest.raises(ValueError):
        parse_episode_task(data)


@pytest.mark.parametrize("field", ["id", "seed", "split"])
def test_rejects_duplicate_seeds_ids_and_missing_splits(field):
    data = manifest()
    data["episodes"][1][field] = data["episodes"][0][field]
    with pytest.raises(ValueError):
        parse_episode_task(data)


@pytest.mark.parametrize("steps", [0, 501, True, 200.0])
def test_bounds_episode_steps(steps):
    data = manifest()
    data["max_steps"] = steps
    with pytest.raises(ValueError):
        parse_episode_task(data)


@pytest.mark.parametrize("threshold", [True, "1", float("nan"), float("inf"), 10**400])
def test_rejects_invalid_return_threshold(threshold):
    data = manifest()
    data["min_return"] = threshold
    with pytest.raises(ValueError):
        parse_episode_task(data)


def test_requires_both_control_outcomes_and_unique_ids():
    for controls in [[], manifest()["controls"][:1], [manifest()["controls"][0], {**manifest()["controls"][1], "id": "valid"}]]:
        data = manifest()
        data["controls"] = controls
        with pytest.raises(ValueError):
            parse_episode_task(data)


def test_bounds_episode_and_control_counts():
    for field, multiplier in [("episodes", 7), ("controls", 3)]:
        data = manifest()
        data[field] *= multiplier
        with pytest.raises(ValueError):
            parse_episode_task(data)


def test_rejects_unknown_task_and_nested_fields():
    data = manifest()
    data["protected_paths"] = []
    with pytest.raises(ValueError):
        parse_episode_task(data)
    data = manifest()
    data["environment"]["command"] = "unsafe"
    with pytest.raises(ValueError):
        parse_episode_task(data)


@pytest.mark.parametrize("policy", [{"file": "../policy.py", "function": "act"}, {"file": "missing.py", "function": "act"}, {"file": "policy.py", "function": "class"}])
def test_rejects_unsafe_or_missing_policy_entrypoint(policy):
    data = manifest()
    data["policy"] = policy
    with pytest.raises(ValueError):
        parse_episode_task(data)


def test_rejects_unsafe_or_oversized_files():
    for files in [{"../outside": "x"}, {"file": "x" * 65_537}, {"A": "x", "a/b": "y"}]:
        data = manifest()
        data["snapshots"]["observed"] = files
        with pytest.raises(ValueError):
            parse_episode_task(data)


def test_rejects_nonfinite_or_deep_environment_kwargs():
    data = manifest()
    data["environment"]["kwargs"] = {"gravity": float("inf")}
    with pytest.raises(ValueError):
        parse_episode_task(data)
    nested = []
    for _ in range(30):
        nested = [nested]
    data["environment"]["kwargs"] = {"nested": nested}
    with pytest.raises(ValueError):
        parse_episode_task(data)
