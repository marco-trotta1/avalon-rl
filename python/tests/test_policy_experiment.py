from dataclasses import replace
import json
import stat

from avalon_lab.policy_experiment import ExperimentPlan, run_policy_experiment
from test_policy_mdp import mdp_value


def experiment_inputs(tmp_path):
    result = {"train_paths": [], "same_family_paths": [], "family_paths": []}
    for role, seed, tasks, family, split in (("train_paths", 7, ("settle-a", "settle-b"), "invoice-settlement", "train"), ("same_family_paths", 1007, ("settle-a", "settle-b"), "invoice-settlement", "eval"), ("family_paths", 2007, ("close-ticket", "settle-and-close"), "ticket-resolution", "eval")):
        for task in tasks:
            value = mdp_value()
            value.update(seed=seed, family=family, split=split)
            value["task"]["id"] = task
            path = tmp_path / f"{role}-{task}.json"
            path.write_text(json.dumps(value))
            result[role].append(path)
    plan = replace(ExperimentPlan(), learner_seeds=(0, 1), interactions=30, horizon=2, training_generator_seeds=(7,), same_family_generator_seeds=(1007,), family_generator_seeds=(2007,), bootstrap_resamples=100)
    return {key: tuple(values) for key, values in result.items()}, plan


def test_experiment_preserves_all_conditions_hashes_controls_and_negative_results(tmp_path):
    paths, plan = experiment_inputs(tmp_path)
    first = run_policy_experiment(**paths, output=tmp_path / "first", plan=plan)
    second = run_policy_experiment(**paths, output=tmp_path / "second", plan=plan)
    assert first["semantic_result_hash"] == second["semantic_result_hash"]
    assert first["plan_hash"] == second["plan_hash"]
    assert len(first["runs"]) == 18
    assert all(row["interaction_count"] == 30 for row in first["runs"])
    assert len(first["paired_comparisons"]) == 18
    assert all(item["seed_clusters"] == 2 for item in first["paired_comparisons"])
    assert len(first["baselines"]) == 24
    assert first["negative_results"]
    assert first["api_calls"] == first["api_cost_usd"] == 0
    assert first["local_compute_cost_usd"] is None
    assert first["memory"]["peak_process_bytes"] > 0
    assert all(row["latency_ms"]["training"] > 0 for row in first["runs"])
    plan_file = json.loads((tmp_path / "first/plan.json").read_text())
    assert plan_file["hash"] == first["plan_hash"]
    for path in (tmp_path / "first").rglob("*"):
        if path.is_file():
            assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_invalid_plan_fails_before_output_creation_or_parameter_updates(tmp_path):
    import pytest
    paths, plan = experiment_inputs(tmp_path)
    output = tmp_path / "invalid"
    with pytest.raises(ValueError, match="bootstrap seed"):
        run_policy_experiment(**paths, output=output, plan=replace(plan, bootstrap_seed=-1))
    assert not output.exists()
