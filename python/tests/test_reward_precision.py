from dataclasses import replace
import json
from types import SimpleNamespace

import gymnasium as gym
import minari
import numpy as np
import pytest

from avalon_lab.counter import CounterEnv, record_counter
from avalon_lab.gym_recorder import record_builtin
from avalon_lab.learner import learner_snapshot
from avalon_lab.local_export import export_dataset
from avalon_lab.minari_bridge import export_collected


def through_boundary(boundary, *, reward, monkeypatch):
    if boundary in ("local-export", "collected-export"):
        episode = minari.EpisodeData(0, np.array([0, 1]), np.array([1]), np.array([reward]), np.array([False]), np.array([True]), {})
        identity = json.dumps({"id": "episode-0", "task": "counter", "indices": [0], "metadata": {}})
        storage = SimpleNamespace(get_episode_metadata=lambda indices: iter([{"avalon_identity": identity}]))
        dataset = SimpleNamespace(storage=storage, episode_indices=[0], iterate_episodes=lambda: iter([episode]))
        return export_dataset(dataset, seed=7, task="counter") if boundary == "local-export" else export_collected(dataset, seed=7)
    if boundary == "learner":
        recorded = replace(record_counter(seed=7), stage="recorded")
        episode = recorded.episodes[0]
        step = replace(episode.steps[0], reward=reward)
        return learner_snapshot(replace(recorded, episodes=(replace(episode, steps=(step,)),)))

    class RewardCounter(CounterEnv):
        def step(self, action):
            observation, _, terminated, truncated, info = super().step(action)
            return observation, reward, terminated, truncated, info

    environment = gym.wrappers.TimeLimit(RewardCounter(), max_episode_steps=1)
    if boundary == "counter-recorder":
        try:
            return record_counter(seed=7, episodes=1, env=environment)
        finally:
            environment.close()
    monkeypatch.setattr(gym, "make", lambda *args, **kwargs: environment)
    return record_builtin(environment_id="CartPole-v1", seed=7, episodes=1, max_steps=1)


@pytest.mark.parametrize("boundary", ["local-export", "collected-export", "learner", "counter-recorder", "builtin-recorder"])
@pytest.mark.parametrize("reward", [np.int64(2**53 + 1), np.int64(-(2**53 + 1)), np.uint64(2**53 + 1)])
def test_unsafe_integer_reward_fails_before_float_conversion(boundary, reward, monkeypatch):
    with pytest.raises(ValueError, match="exact JSON number"):
        through_boundary(boundary, reward=reward, monkeypatch=monkeypatch)


@pytest.mark.parametrize("boundary", ["local-export", "collected-export", "learner", "counter-recorder", "builtin-recorder"])
def test_largest_safe_integer_reward_preserves_its_exact_value(boundary, monkeypatch):
    snapshot = through_boundary(boundary, reward=np.int64(2**53 - 1), monkeypatch=monkeypatch)
    reward = snapshot.episodes[0].steps[0].reward
    assert reward.as_integer_ratio() == (2**53 - 1, 1)
