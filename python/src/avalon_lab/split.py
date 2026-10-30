"""Split complete episodes through declared metadata groups."""

from dataclasses import dataclass, replace
import json

import numpy as np

from .snapshot import Snapshot


@dataclass(frozen=True)
class DatasetSplit:
    train: Snapshot
    evaluation: Snapshot
    split_seed: int
    group_keys: tuple[str, ...]


def split_grouped(snapshot: Snapshot, *, seed: int, evaluation_fraction: float = 0.25, group_keys: tuple[str, ...] = ("task_family",)) -> DatasetSplit:
    if not 0 <= seed <= 0xFFFFFFFF or not 0 < evaluation_fraction < 1:
        raise ValueError("Use a uint32 seed and a fraction between zero and one.")
    if not group_keys or len(set(group_keys)) != len(group_keys) or "task_family" not in group_keys:
        raise ValueError("Use unique group keys that include task_family.")
    episodes = snapshot.episodes
    if len({episode.id for episode in episodes}) != len(episodes):
        raise ValueError("Use unique episode identifiers before splitting.")
    parents = list(range(len(episodes)))

    def root(index: int) -> int:
        while parents[index] != index:
            index = parents[index]
        return index

    owners = {}
    for index, episode in enumerate(episodes):
        for key in group_keys:
            value = (episode.metadata or {}).get(key)
            if type(value) not in (str, int) or (isinstance(value, str) and not value.strip()):
                raise ValueError(f"{episode.id}.{key}: Use a nonempty string or integer group.")
            token = (key, json.dumps(value))
            if token in owners:
                parents[root(index)] = root(owners[token])
            else:
                owners[token] = index
    groups = sorted({root(index) for index in range(len(episodes))})
    if len(groups) < 2:
        raise ValueError("Use at least two independent episode groups.")
    shuffled = np.random.default_rng(seed).permutation(groups)
    evaluation_count = min(len(groups) - 1, max(1, round(len(groups) * evaluation_fraction)))
    selected = set(int(value) for value in shuffled[:evaluation_count])
    train = tuple(episode for index, episode in enumerate(episodes) if root(index) not in selected)
    evaluation = tuple(episode for index, episode in enumerate(episodes) if root(index) in selected)
    return DatasetSplit(replace(snapshot, episodes=train), replace(snapshot, episodes=evaluation), seed, group_keys)
