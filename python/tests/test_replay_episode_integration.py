"""Opt-in tests execute real policies and real host simulators."""

import os
import pytest

from avalon_lab.replay_actor import DockerPolicySession
from avalon_lab.replay_adapters import create_adapter
from avalon_lab.replay_episode_contract import EnvironmentSpec
from avalon_lab.replay_episode_demo import episode_demo
from avalon_lab.replay_episodes import run_episode_campaign

pytestmark = pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker episode tests explicitly.")


@pytest.mark.parametrize("name", ["CartPole-v1", "FrozenLake-v1"])
def test_real_docker_episode_campaign_scores_host_rewards(name):
    task = episode_demo(name)
    report = run_episode_campaign(task, {"repair": task.snapshots.reference, "always-left": task.snapshots.observed}, "python:3.11.15-slim")
    assert report["grader"]["status"] == "accepted"
    assert report["status"] == "rejected"
    assert not report["cleanup_blocked"]
    repair, baseline = report["candidates"]
    assert repair["status"] == "accepted"
    assert baseline["status"] == "rejected"
    assert repair["development"]["passed"] == repair["holdout"]["passed"] == 2
    for row in repair["run"]["episodes"]:
        assert row["return"] >= task.min_return
        assert len(row["transitions"]) == row["steps"]
        assert row["environment"]["reward_authority"] == "trusted-host-world"
        assert row["actor"]["cleanup_blocked"] is False


def test_real_docker_continuous_policy_drives_host_pendulum():
    world = create_adapter(EnvironmentSpec("gymnasium", "Pendulum-v1", {}), max_steps=3)
    actor = DockerPolicySession(files={"policy.py": "def act(observation):\n    return [0.0]\n"},
                               entrypoint_file="policy.py", function="act", image="python:3.11.15-slim")
    try:
        observation = world.reset(seed=19)
        actor.start()
        for _ in range(3):
            step = world.step(actor.act(observation))
            observation = step.observation
        assert step.truncated and not step.terminated
        assert len(observation) == 3
        assert step.reward <= 0
    finally:
        receipt = actor.close()
        world.close()
    assert not receipt["cleanup_blocked"]
