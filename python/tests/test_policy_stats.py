import math

import pytest

from avalon_lab.policy_stats import paired_seed_summary


def test_paired_seed_bootstrap_retains_pairs_and_reproduces_negative_results():
    candidate = {0: 0.0, 1: 0.5, 2: 1.0, 3: 0.5}
    baseline = {0: 0.5, 1: 1.0, 2: 1.0, 3: 0.0}
    report = paired_seed_summary(candidate=candidate, baseline=baseline, candidate_name="candidate", baseline_name="fixed", resamples=500)
    assert report == paired_seed_summary(candidate=candidate, baseline=baseline, candidate_name="candidate", baseline_name="fixed", resamples=500)
    assert report["seed_clusters"] == 4
    assert report["paired_differences"] == [-0.5, -0.5, 0.0, 0.5]
    assert math.isclose(report["paired_difference_mean"], -0.125, abs_tol=1e-12)
    assert report["bootstrap_95_percentile"][0] <= 0 <= report["bootstrap_95_percentile"][1]


def test_identical_seed_results_have_an_exact_zero_paired_interval():
    scores = {seed: seed / 20 for seed in range(20)}
    report = paired_seed_summary(candidate=scores, baseline=scores, candidate_name="same", baseline_name="same")
    assert all(math.isclose(value, 0, abs_tol=1e-12) for value in report["bootstrap_95_percentile"])


@pytest.mark.parametrize("candidate,baseline", [({0: 1}, {0: 1}), ({0: 0, 1: 1}, {0: 0, 2: 1}), ({0: float("nan"), 1: 1}, {0: 0, 1: 1})])
def test_bootstrap_rejects_unpaired_or_invalid_seed_metrics(candidate, baseline):
    with pytest.raises(ValueError):
        paired_seed_summary(candidate=candidate, baseline=baseline, candidate_name="x", baseline_name="y")
