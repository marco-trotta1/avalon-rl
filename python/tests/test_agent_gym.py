import json
import os
import subprocess
import sys

import gymnasium as gym
import numpy as np
import pytest

from avalon_lab.gym_training import (
    TrainConfig, audit_credit, discounted_returns, evaluate_checkpoint,
    log_policy_gradient, policy_distribution, read_checkpoint,
    record_probabilities, train_policy,
)
from avalon_lab.sampling import audit_sampling_receipts, read_sampling_receipt


@pytest.mark.parametrize("seed", range(4))
def test_policy_gradient_matches_finite_differences(seed):
    rng = np.random.default_rng(seed)
    weights = rng.normal(0, 0.2, (5, 2))
    observation = rng.normal(size=4)
    action = seed % 2
    analytic = log_policy_gradient(weights=weights, observation=observation, action=action)
    numerical = np.zeros_like(weights)
    epsilon = 1e-6
    for index in np.ndindex(weights.shape):
        before, after = weights.copy(), weights.copy()
        before[index] -= epsilon
        after[index] += epsilon
        numerical[index] = (
            np.log(policy_distribution(weights=after, observation=observation)[action])
            - np.log(policy_distribution(weights=before, observation=observation)[action])
        ) / (2 * epsilon)
    np.testing.assert_allclose(analytic, numerical, atol=1e-8, rtol=1e-6)


def test_returns_stop_at_the_capped_episode_boundary():
    assert discounted_returns(rewards=[1.0, 2.0, 3.0], discount=0.5) == [2.75, 3.5, 3.0]


def test_real_training_is_seeded_updates_parameters_and_preserves_endings(tmp_path):
    config = TrainConfig(seed=7, episodes=4, max_steps=12)
    first = train_policy(output=tmp_path / "first", config=config)
    second = train_policy(output=tmp_path / "second", config=config)
    left = json.loads((tmp_path / "first/checkpoint.json").read_text())
    right = json.loads((tmp_path / "second/checkpoint.json").read_text())
    assert left == right
    assert first["training"]["updates"] == 4
    assert 4 <= first["training"]["transitions"] <= 48
    assert first["training"]["initial_parameter_sha256"] != first["training"]["final_parameter_sha256"]
    assert first["episodes"] == second["episodes"]
    credit = json.loads((tmp_path / "first/credit.json").read_text())
    for episode in credit["episodes"]:
        assert episode["steps"][-1]["terminated"] or episode["steps"][-1]["truncated"]
        assert not any(row["terminated"] or row["truncated"] for row in episode["steps"][:-1])
    assert audit_credit(source=tmp_path / "first/credit.json")["status"] == "pass"
    assert os.stat(tmp_path / "first").st_mode & 0o777 == 0o700
    for name in ("training.json", "checkpoint.json", "credit.json"):
        assert os.stat(tmp_path / "first" / name).st_mode & 0o777 == 0o600


@pytest.mark.parametrize("kwargs", [
    {"episodes": 1001}, {"max_steps": 501}, {"episodes": 100, "max_steps": 500},
    {"seed": True}, {"discount": float("nan")}, {"learning_rate": 0},
])
def test_invalid_training_limits_fail_before_execution(tmp_path, monkeypatch, kwargs):
    def forbidden(*args, **options):
        raise AssertionError("Invalid limits must not create an environment.")
    monkeypatch.setattr(gym, "make", forbidden)
    with pytest.raises(ValueError):
        train_policy(output=tmp_path / "bad", config=TrainConfig(**kwargs))
    assert not (tmp_path / "bad").exists()


def test_existing_output_and_modified_registration_fail_before_training(tmp_path, monkeypatch):
    existing = tmp_path / "existing"
    existing.mkdir()
    (existing / "keep").write_text("preserve")
    with pytest.raises(FileExistsError):
        train_policy(output=existing, config=TrainConfig(episodes=1, max_steps=2))
    assert (existing / "keep").read_text() == "preserve"
    monkeypatch.setattr(gym.spec("CartPole-v1"), "entry_point", "untrusted.module:Environment")
    with pytest.raises(ValueError, match="registration"):
        train_policy(output=tmp_path / "untrusted", config=TrainConfig(episodes=1, max_steps=2))
    assert not (tmp_path / "untrusted").exists()


@pytest.mark.parametrize("attribute,value", [
    ("kwargs", {"sutton_barto_reward": True}), ("nondeterministic", True),
    ("order_enforce", False), ("disable_env_checker", True), ("max_episode_steps", 4),
])
def test_registration_options_cannot_silently_change_the_environment(tmp_path, monkeypatch, attribute, value):
    monkeypatch.setattr(gym.spec("CartPole-v1"), attribute, value)
    with pytest.raises(ValueError, match="registration"):
        train_policy(output=tmp_path / "changed", config=TrainConfig(episodes=2, max_steps=4))
    assert not (tmp_path / "changed").exists()


def test_failed_collection_retains_the_steps_that_actually_completed(tmp_path, monkeypatch):
    real_make = gym.make

    class BrokenEnvironment(gym.Wrapper):
        calls = 0

        def step(self, action):
            self.calls += 1
            if self.calls == 3:
                raise RuntimeError("Injected collection failure.")
            return self.env.step(action)

    monkeypatch.setattr(gym, "make", lambda *args, **kwargs: BrokenEnvironment(real_make(*args, **kwargs)))
    with pytest.raises(RuntimeError, match="Injected"):
        train_policy(output=tmp_path / "failed", config=TrainConfig(episodes=2, max_steps=5))
    failure = json.loads((tmp_path / "failed/failure.json").read_text())
    assert failure["status"] == "failed"
    assert failure["completed_step_count"] == 2
    assert len(failure["incomplete_episode"]["steps"]) == 2
    assert failure["phase"] == "collection"
    assert not (tmp_path / "failed/checkpoint.json").exists()


def test_checkpoint_identity_is_checked_and_input_symlinks_are_rejected(tmp_path):
    train_policy(output=tmp_path / "run", config=TrainConfig(episodes=2, max_steps=5))
    checkpoint = tmp_path / "run/checkpoint.json"
    modified = json.loads(checkpoint.read_text())
    modified["weights"][0][0] += 0.1
    tampered = tmp_path / "tampered.json"
    tampered.write_text(json.dumps(modified))
    with pytest.raises(ValueError, match="parameter"):
        read_checkpoint(tampered)
    linked = tmp_path / "linked.json"
    linked.symlink_to(checkpoint)
    with pytest.raises(OSError):
        read_checkpoint(linked)


def test_evaluation_freezes_the_checkpoint_and_rejects_training_seeds(tmp_path):
    train_policy(output=tmp_path / "run", config=TrainConfig(seed=7, episodes=3, max_steps=10))
    checkpoint = tmp_path / "run/checkpoint.json"
    before = checkpoint.read_bytes()
    with pytest.raises(ValueError, match="overlap"):
        evaluate_checkpoint(checkpoint=checkpoint, seeds=(8, 1001), max_steps=20)
    report = evaluate_checkpoint(checkpoint=checkpoint, seeds=(1001, 1002, 1003), max_steps=20)
    repeated = evaluate_checkpoint(checkpoint=checkpoint, seeds=(1001, 1002, 1003), max_steps=20)
    assert report["policy_sha256"] == repeated["policy_sha256"]
    assert report["training_updates_during_evaluation"] == 0
    assert set(report["policies"]) == {"learned-stochastic", "uniform-random", "angle-velocity-control"}
    for policy in report["policies"]:
        first = report["policies"][policy]
        second = repeated["policies"][policy]
        assert first["returns"] == second["returns"]
        assert first["sample_count"] == 3
    assert len(report["comparisons"]) == 2
    assert checkpoint.read_bytes() == before


def test_captured_real_probabilities_work_with_the_existing_auditor(tmp_path):
    train_policy(output=tmp_path / "run", config=TrainConfig(episodes=2, max_steps=8))
    report = record_probabilities(
        checkpoint=tmp_path / "run/checkpoint.json", output=tmp_path / "probs",
        seed=2001, episodes=2, max_steps=10,
    )
    source = read_sampling_receipt(tmp_path / "probs/source.json")
    target = read_sampling_receipt(tmp_path / "probs/target.json")
    assert source.producer.name != target.producer.name
    assert audit_sampling_receipts(source=source, target=target).status == "pass"
    assert report["status"] == "pass"
    assert 2 <= len(source.samples) <= 20
    rollout = json.loads((tmp_path / "probs/rollout.json").read_text())
    assert sum(len(episode["steps"]) for episode in rollout["episodes"]) == len(source.samples)


def test_capture_preserves_the_actual_sampler_distribution_when_replay_disagrees(tmp_path, monkeypatch):
    import avalon_lab.gym_training as trainer
    train_policy(output=tmp_path / "run", config=TrainConfig(episodes=1, max_steps=2))
    original = trainer.policy_distribution
    calls = 0

    def changed_sampler(*, weights, observation):
        nonlocal calls
        calls += 1
        if calls == 1:
            return np.array([1.0, 0.0])
        return original(weights=weights, observation=observation)

    monkeypatch.setattr(trainer, "policy_distribution", changed_sampler)
    report = record_probabilities(
        checkpoint=tmp_path / "run/checkpoint.json", output=tmp_path / "probs",
        seed=2001, episodes=1, max_steps=1,
    )
    assert report["status"] == "fail"
    source = json.loads((tmp_path / "probs/source.json").read_text())
    assert source["samples"][0]["support"]["token_ids"] == [0]
    assert source["samples"][0]["selected_logprob"]["value"] == pytest.approx(0, abs=1e-15)


@pytest.mark.parametrize("mutation", ["large-number", "boolean-seed", "boolean-count", "producer-type", "source-drift", "zero-updates"])
def test_checkpoint_boundary_rejects_malformed_numbers_and_metadata(tmp_path, mutation):
    train_policy(output=tmp_path / "run", config=TrainConfig(seed=0, episodes=1, max_steps=2))
    value = json.loads((tmp_path / "run/checkpoint.json").read_text())
    if mutation == "large-number":
        value["weights"][0][0] = 10 ** 500
    elif mutation == "boolean-seed":
        value["training"]["episode_seeds"][0] = False
    elif mutation == "boolean-count":
        value["training"]["episodes"] = True
    elif mutation == "producer-type":
        value["producer"]["python"] = {"unexpected": "object"}
    elif mutation == "source-drift":
        value["producer"]["source_sha256"] = "0" * 64
    else:
        value["training"]["updates"] = 0
    source = tmp_path / "malformed.json"
    source.write_text(json.dumps(value))
    with pytest.raises(ValueError):
        read_checkpoint(source)


@pytest.mark.parametrize("mutation", ["return", "advantage", "discount_weight", "mask", "role", "position", "group", "baseline", "ending"])
def test_credit_audit_detects_mechanical_assignment_errors(tmp_path, mutation):
    train_policy(output=tmp_path / "run", config=TrainConfig(episodes=2, max_steps=5))
    value = json.loads((tmp_path / "run/credit.json").read_text())
    row = value["episodes"][0]["steps"][0]
    if mutation in ("return", "advantage", "discount_weight"):
        row[mutation] += 0.25
    elif mutation == "mask":
        row["loss_mask"] = False
    elif mutation == "role":
        row["role"] = "tool"
    elif mutation == "position":
        row["position"] = 3
    elif mutation == "group":
        value["episodes"][1]["group_id"] = value["episodes"][0]["group_id"]
    elif mutation == "baseline":
        value["episodes"][1]["baseline"] += 1
    else:
        row["terminated"] = True
    source = tmp_path / "bad.json"
    source.write_text(json.dumps(value))
    report = audit_credit(source=source)
    assert report["status"] == "fail"
    assert any(item["status"] == "mismatch" for item in report["findings"])


def test_credit_input_rejects_duplicate_keys_nonfinite_and_special_files(tmp_path):
    for index, content in enumerate((
        '{"format":"a","format":"b"}', '{"x": NaN}',
    )):
        source = tmp_path / f"bad-{index}.json"
        source.write_text(content)
        with pytest.raises(ValueError):
            audit_credit(source=source)
    fifo = tmp_path / "fifo"
    os.mkfifo(fifo)
    with pytest.raises(ValueError, match="regular"):
        audit_credit(source=fifo)


def test_standalone_cli_executes_training_evaluation_capture_and_credit(tmp_path):
    def invoke(*args):
        return subprocess.run(
            [sys.executable, "-m", "avalon_lab.agent_cli", *map(str, args)],
            capture_output=True, text=True, timeout=30,
        )
    trained = invoke("gym-train", "--output", tmp_path / "train", "--episodes", 2, "--max-steps", 5)
    assert trained.returncode == 0, trained.stderr
    evaluated = invoke("gym-eval", "--checkpoint", tmp_path / "train/checkpoint.json", "--seeds", "1001,1002", "--max-steps", 10, "--output", tmp_path / "eval.json")
    assert evaluated.returncode == 0, evaluated.stderr
    capture = invoke("gym-probs", "--checkpoint", tmp_path / "train/checkpoint.json", "--output", tmp_path / "capture", "--episodes", 1, "--max-steps", 5)
    assert capture.returncode == 0, capture.stderr
    credit = invoke("credit-audit", "--source", tmp_path / "train/credit.json", "--output", tmp_path / "credit.json")
    assert credit.returncode == 0, credit.stderr
    bad = invoke("gym-train", "--output", tmp_path / "excess", "--episodes", 1000, "--max-steps", 500)
    assert bad.returncode == 1
    assert not (tmp_path / "excess").exists()
