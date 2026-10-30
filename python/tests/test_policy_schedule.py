import copy

import pytest

from avalon_lab.policy_mdp import parse_mdp
from avalon_lab.policy_schedule import train_schedule
from test_policy_mdp import mdp_value


def catalog():
    first = mdp_value()
    second = copy.deepcopy(first)
    second["seed"] = 8
    return parse_mdp(first), parse_mdp(second)


def test_fixed_and_random_schedules_share_an_action_budget_and_separate_rngs():
    tables = catalog()
    fixed = train_schedule(tables, seed=7, interactions=101, schedule="fixed")
    random = train_schedule(tables, seed=7, interactions=101, schedule="random")
    repeat = train_schedule(tables, seed=7, interactions=101, schedule="random")
    assert len(fixed.training.updates) == len(random.training.updates) == 101
    assert random == repeat
    assert [episode.table_hash for episode in fixed.episodes[:4]] == [table.artifact_hash for table in tables] * 2
    assert {episode.table_hash for episode in random.episodes} == {table.artifact_hash for table in tables}
    assert all(episode.stop - episode.start == len(episode.actions) for episode in random.episodes)
    assert sum(len(episode.actions) for episode in random.episodes) == 101


@pytest.mark.parametrize("budget", range(1, 18))
def test_budget_never_adds_a_fictitious_training_transition(budget):
    run = train_schedule(catalog(), seed=13, interactions=budget)
    assert len(run.training.updates) == budget
    assert run.episodes[-1].stop == budget
    assert all(episode.completed == (episode.outcome is not None) for episode in run.episodes)


def test_schedule_rejects_evaluation_inputs_before_updates():
    value = mdp_value()
    value["split"] = "eval"
    with pytest.raises(ValueError, match="training tables"):
        train_schedule((parse_mdp(value),), seed=7, interactions=10)


def test_shared_feature_aliases_cannot_hide_different_reward_rules():
    first = mdp_value()
    second = copy.deepcopy(first)
    second["seed"] = 8
    for state in second["states"]:
        for edge in state["transitions"]:
            if edge["outcome"] is not None:
                edge["rewards"]["history"] = 0
    with pytest.raises(ValueError, match="aliases"):
        train_schedule((parse_mdp(first), parse_mdp(second)), seed=7, interactions=10)


def test_disagreement_schedule_uses_training_outcomes_after_coverage():
    import random
    from avalon_lab.policy_mdp import Count
    from avalon_lab.policy_schedule import TrainingScore, choose_training_index
    scores = (TrainingScore(Count(5), Count(0)), TrainingScore(Count(5), Count(4)))
    assert choose_training_index(scores=scores, schedule="disagreement", episode=10, rng=random.Random(7))[:2] == (1, "training-disagreement")
    scores = (TrainingScore(), TrainingScore(Count(5), Count(4)))
    assert choose_training_index(scores=scores, schedule="disagreement", episode=5, rng=random.Random(7))[:2] == (0, "coverage")


def test_disagreement_training_has_a_deterministic_prefix_and_no_future_scores():
    short = train_schedule(catalog(), seed=19, interactions=41, arm="claim", schedule="disagreement")
    long = train_schedule(catalog(), seed=19, interactions=101, arm="claim", schedule="disagreement")
    assert short.training.updates == long.training.updates[:41]
    assert [episode.selection_reason for episode in long.episodes[:2]] == ["coverage", "coverage"]
    assert all(episode.selection_reason == "training-disagreement" for episode in long.episodes[2:])
    assert all(episode.selection_score is None or 0 < episode.selection_score < 1 for episode in long.episodes)
    assert sum(len(episode.actions) for episode in long.episodes) == 101
