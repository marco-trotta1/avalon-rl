import json
import math
from pathlib import Path

from avalon_lab.policy_evaluation import evaluate_actions, evaluate_baseline, evaluate_policy
from avalon_lab.policy_learning import train_policy
from avalon_lab.policy_mdp import parse_mdp, read_mdp

OPERATIONS = Path(__file__).resolve().parents[2] / "examples/policy/operations-settle-a.json"


def test_restored_unauthorized_payment_separates_final_and_history_rewards():
    table = read_mdp(OPERATIONS)
    actions = ("pay-b", "restore-b", "pay-a", "finish")
    results = {arm: evaluate_actions(table, actions=actions, arm=arm) for arm in ("claim", "final", "history")}
    assert results["final"].outcome.goal_complete
    assert results["final"].outcome.protected_preserved
    assert results["final"].outcome.prohibited_actions == 2
    assert not results["final"].outcome.valid
    assert math.isclose(results["final"].proxy_return, 1.0, abs_tol=1e-12)
    assert math.isclose(results["history"].proxy_return, 0.0, abs_tol=1e-12)
    assert all(result.outcome_matches for result in results.values())


def test_independent_evaluator_rejects_a_forged_expected_verdict():
    value = json.loads(OPERATIONS.read_text())
    for state in value["states"]:
        for edge in state["transitions"]:
            if edge["outcome"] is not None:
                edge["outcome"]["valid"] = True
    table = parse_mdp(value)
    actual = evaluate_actions(table, actions=("claim-done", "finish"), arm="claim")
    assert not actual.outcome.valid
    assert actual.recorded_outcome.valid
    assert not actual.outcome_matches
    assert math.isclose(actual.proxy_return, 1.0, abs_tol=1e-12)


def test_all_reward_arms_use_the_same_dynamics_and_frozen_evaluation():
    table = read_mdp(OPERATIONS)
    policies = [train_policy(table, seed=7, interactions=600, arm=arm) for arm in ("claim", "final", "history")]
    assert len({run.table_hashes for run in policies}) == 1
    assert all(len(run.updates) == 600 for run in policies)
    for run in policies:
        before = run.policy.hash
        evaluation = evaluate_policy(table, policy=run.policy, seed=1007, arm=run.config.arm)
        assert evaluation.policy_hash == before == run.policy.hash
        assert evaluation.outcome_matches
        assert evaluation.strategy == "learned"
    assert all(evaluate_baseline(table, baseline="known-good", seed=seed).outcome.valid for seed in range(5))
    assert evaluate_baseline(table, baseline="random", seed=9) == evaluate_baseline(table, baseline="random", seed=9)


def test_independent_success_does_not_trust_a_contradictory_reward_column():
    value = json.loads(OPERATIONS.read_text())
    for state in value["states"]:
        for edge in state["transitions"]:
            if edge["outcome"] is not None:
                edge["rewards"]["history"] = 1
    table = parse_mdp(value)
    actual = evaluate_actions(table, actions=("claim-done", "finish"), arm="history")
    assert math.isclose(actual.proxy_return, 1.0, abs_tol=1e-12)
    assert not actual.outcome.valid
    assert actual.outcome_matches
