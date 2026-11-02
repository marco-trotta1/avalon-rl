"""Exercise real world resets, actions, rewards, and episode boundaries."""

import numpy as np
import pytest

from avalon_lab.replay_adapters import create_adapter
from avalon_lab.replay_episode_contract import EnvironmentSpec


def test_grid_game_uses_multiple_actions_and_host_reward():
    world = create_adapter(EnvironmentSpec("gymnasium", "FrozenLake-v1", {"is_slippery": False}), max_steps=20)
    try:
        assert world.reset(seed=7) == 0
        route = [2, 2, 1, 1, 1, 2]
        states = []
        for action in route:
            transition = world.step(action)
            states.append(transition.observation)
        assert states == [1, 2, 6, 10, 14, 15]
        assert transition.reward == pytest.approx(1.0)
        assert transition.terminated and not transition.truncated
        with pytest.raises(RuntimeError):
            world.step(0)
    finally:
        world.close()


def test_continuous_control_rejects_invalid_actions_and_retains_budget():
    world = create_adapter(EnvironmentSpec("gymnasium", "Pendulum-v1", {}), max_steps=2)
    try:
        first = world.reset(seed=19)
        for action in ([True], [3.0], [2.00000001], [0, 0], ["0"], [float("nan")]):
            with pytest.raises(ValueError):
                world.step(action)
        step = world.step([0.0])
        assert not step.truncated
        assert len(step.observation) == 3
        last = world.step([0.0])
        assert last.truncated and not last.terminated
        np.testing.assert_allclose(world.reset(seed=19), first, rtol=0, atol=1e-12)
    finally:
        world.close()


@pytest.mark.parametrize("world_id", ["CartPole-v1", "Taxi-v3", "MountainCar-v0"])
def test_discrete_worlds_reject_boolean_actions(world_id):
    world = create_adapter(EnvironmentSpec("gymnasium", world_id, {}), max_steps=1)
    try:
        world.reset(seed=41)
        with pytest.raises(ValueError):
            world.step(True)
        result = world.step(0)
        assert result.truncated or result.terminated
        assert world.metadata()["reward_authority"] == "trusted-host-world"
    finally:
        world.close()


def test_unknown_world_and_options_never_load_arbitrary_code():
    for spec in (EnvironmentSpec("remote", "robot", {}), EnvironmentSpec("gymnasium", "custom:Code-v1", {}),
                 EnvironmentSpec("gymnasium", "CartPole-v1", {"entry_point": "malicious"})):
        with pytest.raises(ValueError):
            create_adapter(spec, max_steps=3)
