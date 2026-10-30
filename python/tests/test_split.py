from dataclasses import replace

import pytest

from avalon_lab.counter import record_counter
from avalon_lab.split import split_grouped


def sample():
    snapshot = record_counter(seed=7)
    episode = snapshot.episodes[0]
    episodes = tuple(replace(episode, id=f"episode-{index}", metadata={"task_family": f"family-{index // 2}", "site": f"site-{index // 2}", "year": 2020 + index // 2}) for index in range(8))
    return replace(snapshot, episodes=episodes)


def test_group_split_preserves_episodes_across_twenty_seeds():
    snapshot = sample()
    for seed in range(20):
        result = split_grouped(snapshot, seed=seed, group_keys=("task_family", "site", "year"))
        assert result == split_grouped(snapshot, seed=seed, group_keys=("task_family", "site", "year"))
        combined = result.train.episodes + result.evaluation.episodes
        assert {episode.id for episode in combined} == {episode.id for episode in snapshot.episodes}
        assert len(combined) == len(snapshot.episodes)
        for key in result.group_keys:
            train = {episode.metadata[key] for episode in result.train.episodes}
            evaluation = {episode.metadata[key] for episode in result.evaluation.episodes}
            assert train.isdisjoint(evaluation)
        original = {episode.id: episode for episode in snapshot.episodes}
        assert all(episode == original[episode.id] for episode in combined)


def test_shared_site_links_task_families_into_one_group():
    snapshot = sample()
    linked = tuple(replace(episode, metadata={**episode.metadata, "site": "same-site"}) for episode in snapshot.episodes)
    with pytest.raises(ValueError, match="two independent"):
        split_grouped(replace(snapshot, episodes=linked), seed=7, group_keys=("task_family", "site"))


def test_single_family_fails_instead_of_splitting_rows():
    with pytest.raises(ValueError, match="two independent"):
        split_grouped(record_counter(seed=7), seed=7)


def test_duplicate_episode_identifier_fails():
    snapshot = sample()
    with pytest.raises(ValueError, match="unique episode"):
        split_grouped(replace(snapshot, episodes=snapshot.episodes + (snapshot.episodes[0],)), seed=7)


def test_missing_group_context_fails():
    snapshot = sample()
    with pytest.raises(ValueError, match="missing"):
        split_grouped(snapshot, seed=7, group_keys=("task_family", "missing"))
