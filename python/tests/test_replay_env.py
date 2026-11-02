"""Verify the training boundary with an injected runner, not Docker evidence."""

import json

import pytest

from avalon_lab.replay_demo import ALTERNATIVE, demo_task
from avalon_lab.replay_env import ReplayEnvironment


def test_training_never_requests_holdout_or_exposes_answers(monkeypatch):
    calls = []
    def runner(**kwargs):
        calls.append(kwargs)
        return {"status": "pass", "split": kwargs["split"]}
    monkeypatch.setattr("avalon_lab.replay_env.run_snapshot", runner)
    environment = ReplayEnvironment(task=demo_task())
    observation, info = environment.reset(seed=7)
    assert environment.observation_space.contains(observation)
    assert set(json.loads(observation)) == {"description", "entrypoint", "initial_files"}
    assert "holdout" not in observation
    assert "expected" not in observation
    _, reward, terminated, truncated, _ = environment.step(ALTERNATIVE)
    assert reward == pytest.approx(1.0)
    assert terminated and not truncated
    assert calls[0]["split"] == "development"
    with pytest.raises(RuntimeError):
        environment.step(ALTERNATIVE)


def test_infrastructure_failure_truncates_the_episode(monkeypatch):
    monkeypatch.setattr("avalon_lab.replay_env.run_snapshot", lambda **kwargs: {"status": "inconclusive"})
    environment = ReplayEnvironment(task=demo_task())
    environment.reset()
    _, reward, terminated, truncated, _ = environment.step(ALTERNATIVE)
    assert reward == pytest.approx(0.0)
    assert not terminated and truncated


def test_runner_startup_failure_truncates_the_episode(monkeypatch):
    def unavailable(**kwargs):
        raise RuntimeError("The Docker image is unavailable.")
    monkeypatch.setattr("avalon_lab.replay_env.run_snapshot", unavailable)
    environment = ReplayEnvironment(task=demo_task())
    environment.reset()
    observation, reward, terminated, truncated, info = environment.step(ALTERNATIVE)
    assert environment.observation_space.contains(observation)
    assert reward == pytest.approx(0.0)
    assert not terminated and truncated
    assert info["receipt"]["status"] == "inconclusive"


def test_observation_space_contains_escaped_large_snapshot():
    from avalon_lab.replay_contract import parse_replay_task, task_to_dict
    data = task_to_dict(demo_task())
    for index in range(8):
        data["snapshots"]["initial"][f"file-{index}"] = "\x00" * 65_536
    environment = ReplayEnvironment(task=parse_replay_task(data))
    observation, _ = environment.reset()
    assert environment.observation_space.contains(observation)


def test_rejects_invalid_image_at_startup():
    with pytest.raises(ValueError):
        ReplayEnvironment(task=demo_task(), image="--invalid")


def test_action_space_respects_remaining_snapshot_bytes():
    from avalon_lab.replay_contract import parse_replay_task, task_to_dict
    data = task_to_dict(demo_task())
    for index in range(15):
        data["snapshots"]["initial"][f"file-{index}"] = "x" * 65_536
    data["snapshots"]["initial"]["last-file"] = "x" * 65_000
    environment = ReplayEnvironment(task=parse_replay_task(data))
    other_bytes = sum(len(content.encode("utf-8")) for path, content in environment.task.snapshots.initial.items()
                      if path != environment.task.entrypoint.file)
    assert not environment.action_space.contains("x" * (1_048_576 - other_bytes + 1))
    assert environment.action_space.contains("x" * (1_048_576 - other_bytes))


def test_unconfirmed_cleanup_blocks_reset_and_preserves_container_names(monkeypatch):
    calls = []
    receipt = {"status": "inconclusive", "cleanup_blocked": True, "outstanding_containers": ["avalon-replay-pending"]}
    def runner(**kwargs):
        calls.append(kwargs)
        return receipt
    monkeypatch.setattr("avalon_lab.replay_env.run_snapshot", runner)
    environment = ReplayEnvironment(task=demo_task())
    environment.reset()
    _, _, terminated, truncated, info = environment.step(ALTERNATIVE)
    assert not terminated and truncated
    assert info["receipt"]["outstanding_containers"] == ["avalon-replay-pending"]
    with pytest.raises(RuntimeError, match="cleanup"):
        environment.reset()
    with pytest.raises(RuntimeError):
        environment.step(ALTERNATIVE)
    assert len(calls) == 1
