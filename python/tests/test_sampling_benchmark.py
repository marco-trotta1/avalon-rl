import json

import pytest

from avalon_lab.sampling_benchmark import FAMILIES, VARIANTS_PER_FAMILY, run_sampling_benchmark


def test_frozen_census_keeps_controls_unknowns_and_the_strong_baseline():
    report = run_sampling_benchmark(seed=7)
    assert report["case_count"] == len(FAMILIES) * VARIANTS_PER_FAMILY
    assert report["expected_counts"] == {"pass": 24, "fail": 36, "inconclusive": 16}
    for method in ("avalon", "dense-categorical-assertion"):
        result = report["methods"][method]
        assert result["matching_expected_status"] == report["case_count"]
        assert result["true_positives"] == 36
        assert result["false_positives"] == 0
        assert result["unknowns"] == 16
        assert result["latency_ms"]["n"] == report["case_count"]
    assert report["methods"]["selected-logprob"]["true_positives"] < 36
    assert report["methods"]["complete-support"]["true_positives"] < 36
    assert "parity" in " ".join(report["limits"])
    json.dumps(report, allow_nan=False)


def test_data_hashes_and_results_reproduce_without_comparing_noisy_timings():
    first, second = run_sampling_benchmark(seed=17), run_sampling_benchmark(seed=17)
    assert first["fixture_snapshot_sha256"] == second["fixture_snapshot_sha256"]
    assert first["cases"] == second["cases"]
    assert first["fixture_snapshot_sha256"] != run_sampling_benchmark(seed=18)["fixture_snapshot_sha256"]
    development = {row["family"] for row in first["cases"] if row["partition"] == "development"}
    reserved = {row["family"] for row in first["cases"] if row["partition"] == "reserved"}
    assert development.isdisjoint(reserved)


@pytest.mark.parametrize("seed", [True, -1, 2**32, 0.1])
def test_benchmark_rejects_invalid_seeds(seed):
    with pytest.raises(ValueError, match="uint32"):
        run_sampling_benchmark(seed=seed)
