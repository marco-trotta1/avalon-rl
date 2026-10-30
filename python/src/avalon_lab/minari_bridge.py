"""A real local Minari collection and storage boundary."""

from contextlib import contextmanager
import json
import os
from pathlib import Path

import gymnasium as gym
import minari

from .counter import CounterEnv, record_counter
from .snapshot import Episode, Snapshot, Step, json_value, reward_value


@contextmanager
def dataset_root(path: Path):
    """Select the local Minari root for this synchronous operation."""
    previous = os.environ.get("MINARI_DATASETS_PATH")
    os.environ["MINARI_DATASETS_PATH"] = str(path)
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("MINARI_DATASETS_PATH", None)
        else:
            os.environ["MINARI_DATASETS_PATH"] = previous


def export_collected(dataset, *, seed: int) -> Snapshot:
    metadatas = dataset.storage.get_episode_metadata(dataset.episode_indices)
    episodes = []
    for episode, stored in zip(dataset.iterate_episodes(), metadatas, strict=True):
        identity = json.loads(stored["avalon_identity"])
        steps = tuple(Step(
            identity["indices"][index],
            json_value(episode.observations[index]),
            json_value(episode.actions[index]),
            reward_value(episode.rewards[index], path=f"episode[{episode.id}].rewards[{index}]"),
            json_value(episode.observations[index + 1]),
            bool(episode.terminations[index]),
            bool(episode.truncations[index]),
        ) for index in range(len(episode)))
        episodes.append(Episode(identity["id"], identity["task"], steps, identity["metadata"]))
    return Snapshot("recorded", {"name": "minari", "version": minari.__version__}, seed, "synthetic", tuple(episodes))


def collect_counter(*, root: Path, seed: int, dataset_id: str = "avalon/counter-v0") -> tuple[Snapshot, Snapshot, Path]:
    """Collect, save, reopen, and export actual Minari transitions."""
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with dataset_root(root):
        collector = minari.DataCollector(gym.wrappers.TimeLimit(CounterEnv(), max_episode_steps=3), data_format="hdf5")
        try:
            source = record_counter(seed=seed, env=collector)
            dataset = collector.create_dataset(
                dataset_id=dataset_id,
                algorithm_name="scripted_counter",
                author="Avalon synthetic laboratory",
                description="Synthetic counter transitions. No production evidence.",
                ref_min_score=0.0,
                ref_max_score=1.0,
            )
            dataset.storage.update_episode_metadata([{
                "avalon_identity": json.dumps({
                    "id": episode.id, "task": episode.task,
                    "metadata": episode.metadata,
                    "indices": [step.index for step in episode.steps],
                }, sort_keys=True)
            } for episode in source.episodes])
            saved_path = Path(dataset.spec.data_path)
            reopened = minari.load_dataset(dataset_id, download=False)
            recorded = export_collected(reopened, seed=seed)
            return source, recorded, saved_path
        finally:
            collector.close()
