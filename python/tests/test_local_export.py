from types import SimpleNamespace

import gymnasium as gym
import minari
import numpy as np
import pytest

from avalon_lab.local_export import export_dataset, export_local
from avalon_lab.minari_bridge import collect_counter, dataset_root


def test_local_counter_export_preserves_stored_identity(tmp_path):
    source, _, path = collect_counter(root=tmp_path, seed=7)
    exported = export_local(path=path, seed=7, task="fallback")
    assert exported.episodes == source.episodes
    assert exported.evidence == "user-supplied"


class DictionaryEnv(gym.Env):
    def __init__(self):
        self.observation_space = gym.spaces.Dict({"state": gym.spaces.Discrete(2), "mission": gym.spaces.Text(min_length=2, max_length=2, charset="go")})
        self.action_space = gym.spaces.Discrete(2)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        return {"state": 0, "mission": "go"}, {}

    def step(self, action):
        return {"state": 1, "mission": "go"}, 1.0, True, True, {}


def test_actual_minari_dictionary_and_categorical_values(tmp_path):
    with dataset_root(tmp_path):
        collector = minari.DataCollector(DictionaryEnv(), data_format="hdf5")
        try:
            collector.reset(seed=7)
            collector.step(1)
            dataset = collector.create_dataset("dictionary-v0", ref_min_score=0.0, ref_max_score=1.0)
            dataset.storage.update_episode_metadata([{"mission": "go", "task_family": "dictionary"}])
            exported = export_local(path=dataset.spec.data_path, seed=7, task="dictionary")
        finally:
            collector.close()
    step = exported.episodes[0].steps[0]
    assert step.observation == {"state": 0, "mission": "go"}
    assert step.next_observation == {"state": 1, "mission": "go"}
    assert step.terminated and step.truncated
    assert exported.episodes[0].metadata["mission"] == "go"


def fake_dataset(*, reward=1.0, observations=None):
    episode = minari.EpisodeData(0, np.array([0, 1]) if observations is None else observations, np.array([1]), np.array([reward]), np.array([False]), np.array([True]), {})
    storage = SimpleNamespace(get_episode_metadata=lambda indices: iter([{}]))
    return SimpleNamespace(storage=storage, episode_indices=[0], iterate_episodes=lambda: iter([episode]))


@pytest.mark.parametrize("reward", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_reward_has_boundary_diagnostic(reward):
    with pytest.raises(ValueError, match=r"episode\[0\].rewards"):
        export_dataset(fake_dataset(reward=reward), seed=7, task="counter")


def test_nested_nonfinite_observation_has_precise_path():
    with pytest.raises(ValueError, match=r"episode\[0\].observations.sensor\[1\]"):
        export_dataset(fake_dataset(observations={"sensor": np.array([0.0, float("nan")])}), seed=7, task="counter")


def test_missing_final_observation_fails():
    with pytest.raises(ValueError, match="Expected 2 stored values"):
        export_dataset(fake_dataset(observations=np.array([0])), seed=7, task="counter")


def test_large_integer_rejects_lossy_javascript_conversion():
    with pytest.raises(ValueError, match="exact JSON number"):
        export_dataset(fake_dataset(observations=np.array([0, 2**60])), seed=7, task="counter")
