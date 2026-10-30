from dataclasses import replace

import numpy as np
import pytest

from avalon_lab.counter import record_counter
from avalon_lab.learner import learner_snapshot, train_counter


@pytest.mark.parametrize("terminated,truncated,expected", [(False, False, 1), (True, False, 0), (False, True, 1), (True, True, 0)])
def test_learner_preserves_both_flags_and_uses_termination_mask(terminated, truncated, expected):
    source = record_counter(seed=7)
    episode = source.episodes[0]
    step = replace(episode.steps[0], terminated=terminated, truncated=truncated)
    recorded = replace(source, stage="recorded", episodes=(replace(episode, steps=(step,)),))
    learner = learner_snapshot(recorded)
    actual = learner.episodes[0]
    assert actual.steps[0] == replace(step, bootstrap_mask=expected)
    assert actual.metadata == episode.metadata
    assert actual.id == episode.id


def test_numpy_training_executes_and_is_reproducible():
    recorded = replace(record_counter(seed=7), stage="recorded")
    learner = learner_snapshot(recorded)
    first = train_counter(learner)
    np.testing.assert_array_equal(first, train_counter(learner))
    assert np.isfinite(first).all()
    assert np.max(np.abs(first - 1.0)) > 1e-8
    assert all(step.bootstrap_mask is None for episode in recorded.episodes for step in episode.steps)
