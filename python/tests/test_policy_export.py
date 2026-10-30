from dataclasses import replace
import json
import stat
import subprocess
import os

import pytest

from avalon_lab.policy_evaluation import evaluate_actions, evaluate_policy
from avalon_lab.policy_export import policy_snapshot, write_policy_evidence
from avalon_lab.policy_learning import train_policy
from avalon_lab.policy_mdp import read_mdp
from avalon_lab.snapshot import read_snapshot
from test_policy_evaluation import OPERATIONS


def test_export_preserves_actual_policy_features_and_separate_world_evidence(tmp_path):
    table = read_mdp(OPERATIONS)
    policy = train_policy(table, seed=7, interactions=400).policy
    evaluation = evaluate_policy(table, policy=policy, seed=1007)
    files = write_policy_evidence(tables=(table,), evaluations=(evaluation,), seed=7, directory=tmp_path, name="learned")
    policy_snapshot_value = read_snapshot(tmp_path / "learned-learner.json")
    world_snapshot_value = read_snapshot(tmp_path / "learned-world.json")
    assert set(files) == {"learned-learner.json", "learned-world.json", "learned-outcomes.json"}
    assert policy_snapshot_value.stage == "learner"
    assert world_snapshot_value.stage == "recorded"
    actual = policy_snapshot_value.episodes[0]
    first_state = table.states[table.initial_state]
    assert actual.steps[0].observation == json.loads(first_state.key)
    assert world_snapshot_value.episodes[0].steps[0].observation == first_state.observation.to_dict()
    assert "independent_outcome" not in actual.metadata
    assert "valid" not in actual.steps[-1].next_observation
    assert actual.metadata["policy_hash"] == policy.hash
    assert all(step.bootstrap_mask == int(not step.terminated) for step in actual.steps)
    assert all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in tmp_path.iterdir())
    result = subprocess.run(["node", os.environ["AVALON_CLI"], "audit", "--source", str(tmp_path / "learned-world.json"), "--target", str(tmp_path / "learned-world.json")], text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    with pytest.raises(FileExistsError):
        write_policy_evidence(tables=(table,), evaluations=(evaluation,), seed=7, directory=tmp_path, name="learned")


def test_export_rejects_relabelled_or_modified_rollout_evidence():
    table = read_mdp(OPERATIONS)
    evaluation = evaluate_actions(table, actions=("claim-done", "finish"), arm="claim")
    altered = replace(evaluation.steps[0], reward=123.0)
    with pytest.raises(ValueError, match="actual transition"):
        policy_snapshot(table, evaluations=(replace(evaluation, steps=(altered, *evaluation.steps[1:])),), seed=7)
    with pytest.raises(ValueError, match="original MDP"):
        policy_snapshot(table, evaluations=(replace(evaluation, table_hash="forged"),), seed=7)


def test_restored_payment_episode_keeps_prohibited_history_out_of_verdict_metadata():
    table = read_mdp(OPERATIONS)
    evaluation = evaluate_actions(table, actions=("pay-b", "restore-b", "pay-a", "finish"), arm="final")
    snapshot = policy_snapshot(table, evaluations=(evaluation,), seed=7, view="world")
    final = snapshot.episodes[0].steps[-1].next_observation
    assert final["prohibitedActions"] == 2
    assert final["invoices"][1]["paid"] == 0
    assert not evaluation.outcome.valid
    assert "valid" not in snapshot.episodes[0].metadata


def test_export_assigns_unique_bound_episode_ids_across_tables(tmp_path):
    from avalon_lab.policy_evaluation import evaluate_baseline
    from avalon_lab.policy_mdp import parse_mdp
    value = json.loads(OPERATIONS.read_text())
    first = parse_mdp(value)
    value["seed"] = 8
    second = parse_mdp(value)
    evaluations = tuple(evaluate_baseline(table, baseline="known-good", seed=1007) for table in (first, second))
    assert all(item.outcome.valid for item in evaluations)
    write_policy_evidence(tables=(first, second), evaluations=evaluations, seed=7, directory=tmp_path, name="paired")
    path = tmp_path / "paired-world.json"
    result = subprocess.run(["node", os.environ["AVALON_CLI"], "audit", "--source", str(path), "--target", str(path)], text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    world = read_snapshot(path)
    learner = read_snapshot(tmp_path / "paired-learner.json")
    outcomes = json.loads((tmp_path / "paired-outcomes.json").read_text())
    identifiers = [episode.id for episode in world.episodes]
    assert len(set(identifiers)) == len(identifiers) == 2
    assert identifiers == [episode.id for episode in learner.episodes] == [row["episode_id"] for row in outcomes["episodes"]]
