import json

import gymnasium as gym
import minari
from minari.serialization import deserialize_space
import pytest

from avalon_lab.local_export import export_local
from avalon_lab.minari_bridge import collect_counter, dataset_root
from avalon_lab.snapshot import json_value


@pytest.mark.parametrize("field", ["observation_space", "action_space"])
def test_missing_space_cannot_recover_a_dataset_environment(tmp_path, monkeypatch, field):
    _, _, path = collect_counter(root=tmp_path / "dataset", seed=7)
    metadata_path = path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata.pop(field)
    metadata["env_spec"] = gym.spec("CartPole-v1").to_json()
    metadata_path.write_text(json.dumps(metadata))
    calls = []

    def forbidden_recovery(*args, **kwargs):
        calls.append(args)
        raise AssertionError("The exporter must not create an environment.")

    monkeypatch.setattr(gym, "make", forbidden_recovery)
    with pytest.raises(ValueError, match="space"):
        export_local(path=path, seed=7, task="counter")
    assert calls == []


@pytest.mark.parametrize("space", [
    None,
    "invalid JSON",
    json.dumps({"type": "ReviewUnsafe"}),
    json.dumps({"type": "Dict", "subspaces": {"nested": {"type": "ReviewUnsafe"}}}),
    json.dumps({"type": "Tuple", "subspaces": [{"type": "ReviewUnsafe"}]}),
    json.dumps({"type": "Discrete", "dtype": "object", "start": 0, "n": 2}),
    json.dumps({"type": "Discrete", "dtype": {"custom": "dtype"}, "start": 0, "n": 2}),
    json.dumps({"type": "Discrete", "dtype": "int64", "start": 0, "n": 2, "entry_point": "review.module:Space"}),
])
def test_unsafe_space_metadata_fails_before_the_loader(tmp_path, monkeypatch, space):
    _, _, path = collect_counter(root=tmp_path / "dataset", seed=7)
    metadata_path = path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["observation_space"] = space
    metadata_path.write_text(json.dumps(metadata))

    def forbidden_loader(*args, **kwargs):
        raise AssertionError("Unsafe metadata must fail before the dataset loader.")

    monkeypatch.setattr(minari, "MinariDataset", forbidden_loader)
    monkeypatch.setitem(deserialize_space.registry, "ReviewUnsafe", forbidden_loader)
    with pytest.raises(ValueError, match="space"):
        export_local(path=path, seed=7, task="counter")


def test_complete_spaces_do_not_execute_the_environment_spec(tmp_path, monkeypatch):
    source, _, path = collect_counter(root=tmp_path / "dataset", seed=7)
    metadata_path = path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    spec = json.loads(gym.spec("CartPole-v1").to_json())
    spec["entry_point"] = "review_never_import:Environment"
    metadata["env_spec"] = json.dumps(spec)
    metadata_path.write_text(json.dumps(metadata))

    def forbidden_recovery(*args, **kwargs):
        raise AssertionError("The exporter must not create an environment.")

    monkeypatch.setattr(gym, "make", forbidden_recovery)
    exported = export_local(path=path, seed=7, task="counter")
    assert exported.episodes == source.episodes


def test_unsupported_storage_fails_before_the_loader(tmp_path, monkeypatch):
    _, _, path = collect_counter(root=tmp_path / "dataset", seed=7)
    metadata_path = path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["data_format"] = "custom-storage"
    metadata_path.write_text(json.dumps(metadata))

    def forbidden_loader(*args, **kwargs):
        raise AssertionError("Unsupported storage must fail before the dataset loader.")

    monkeypatch.setattr(minari, "MinariDataset", forbidden_loader)
    with pytest.raises(ValueError, match="HDF5"):
        export_local(path=path, seed=7, task="counter")


class BuiltinSpacesEnv(gym.Env):
    def __init__(self):
        self.observation_space = gym.spaces.Dict({"values": gym.spaces.Tuple((
            gym.spaces.Box(low=-1.0, high=1.0, shape=(2,)),
            gym.spaces.Discrete(3),
            gym.spaces.MultiDiscrete([2, 3]),
            gym.spaces.MultiBinary(2),
            gym.spaces.Text(max_length=2, min_length=2, charset="go"),
        ))})
        self.action_space = gym.spaces.Discrete(2)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.observation_space.seed(seed)
        return self.observation_space.sample(), {}

    def step(self, action):
        return self.observation_space.sample(), 1.0, True, False, {}


def test_all_supported_spaces_export_actual_minari_data(tmp_path, monkeypatch):
    with dataset_root(tmp_path):
        collector = minari.DataCollector(BuiltinSpacesEnv(), data_format="hdf5")
        try:
            initial, _ = collector.reset(seed=7)
            final, _, _, _, _ = collector.step(1)
            dataset = collector.create_dataset("builtin-spaces-v0", ref_min_score=0.0, ref_max_score=1.0)

            def forbidden_recovery(*args, **kwargs):
                raise AssertionError("The exporter must not create an environment.")

            monkeypatch.setattr(gym, "make", forbidden_recovery)
            exported = export_local(path=dataset.spec.data_path, seed=7, task="builtin-spaces")
        finally:
            collector.close()
    step = exported.episodes[0].steps[0]
    assert step.observation == json_value(initial)
    assert step.next_observation == json_value(final)
