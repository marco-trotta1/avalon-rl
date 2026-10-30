import math

import pytest

from avalon_lab.policy_learning import freeze_policy, train_policy
from avalon_lab.policy_mdp import read_mdp
from test_policy_mdp import FIXTURE, mdp_value


def test_training_executes_real_updates_under_a_fixed_interaction_budget():
    table = read_mdp(FIXTURE)
    run = train_policy(table, seed=7, interactions=400)
    repeat = train_policy(table, seed=7, interactions=400)
    assert len(run.updates) == 400
    assert run.changed_updates > 0
    assert run.policy.hash != freeze_policy({}).hash
    assert run.policy.hash == repeat.policy.hash
    assert run.updates == repeat.updates
    assert any(abs(item.updated - item.previous) > 1e-12 for item in run.updates)
    for item in run.updates:
        assert math.isclose(item.updated, item.previous + 0.3 * (item.target - item.previous), abs_tol=1e-12)
    assert all(item.table_hash == table.artifact_hash for item in run.updates)


def test_horizon_closure_preserves_truncation_without_fictitious_continuation():
    table = read_mdp(FIXTURE)
    run = train_policy(table, seed=11, interactions=100, discount=1.0, epsilon=1.0)
    for item in run.updates:
        if item.truncated:
            source = table.states[item.state_id]
            edge = next(edge for edge in source.transitions if edge.action == item.action)
            assert math.isclose(item.target, edge.reward("history"), abs_tol=1e-12)
    assert any(item.truncated and not item.terminated for item in run.updates)


@pytest.mark.parametrize("options", [{"interactions": 0}, {"seed": True}, {"learning_rate": 0}, {"epsilon": float("nan")}, {"discount": 1.01}, {"arm": "oracle"}])
def test_training_rejects_invalid_budget_or_parameters(options):
    arguments = {"seed": 7, "interactions": 10, **options}
    with pytest.raises(ValueError):
        train_policy(read_mdp(FIXTURE), **arguments)


def test_training_rejects_evaluation_tables():
    from avalon_lab.policy_mdp import parse_mdp
    value = mdp_value()
    value["split"] = "eval"
    with pytest.raises(ValueError, match="training table"):
        train_policy(parse_mdp(value), seed=7, interactions=10)
