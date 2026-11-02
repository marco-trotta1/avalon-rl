"""Benchmark lifecycle tests use fake actors and an explicit host test world."""

from copy import deepcopy
from dataclasses import replace

import pytest

from avalon_lab import replay_benchmark as benchmark
from avalon_lab.replay_actor import ActorError
from avalon_lab.replay_adapters import Transition
from avalon_lab.replay_episodes import run_episode_campaign
from avalon_lab.replay_project_contract import project_to_dict
from avalon_lab.replay_project_demo import project_demo

IMAGE = "sha256:" + "b" * 64


@pytest.fixture
def runtime(monkeypatch):
    calls = []
    monkeypatch.setattr(benchmark, "_docker_endpoint", lambda: "unix:///fake/docker.sock")
    monkeypatch.setattr(benchmark, "_image_id", lambda image, endpoint: IMAGE)

    def evaluate(project, candidates, image_id, timeout_seconds, split):
        calls.append({"project": project_to_dict(project), "candidates": dict(candidates), "image": image_id, "split": split})

        class World:
            def __init__(self, spec, *, max_steps):
                self.steps = 0
                self.target = 0

            def reset(self, *, seed):
                self.target = seed % 2
                return {"target": self.target}

            def step(self, action):
                if type(action) is not int or action not in (0, 1):
                    raise ValueError("Invalid test action.")
                reward = float(action == self.target)
                self.target = 1 - self.target
                self.steps += 1
                return Transition({"target": self.target}, reward, self.steps == 2, False)

            def metadata(self):
                return {"world_hash": benchmark._hash(project_to_dict(project)["world"]),
                        "world_files_hash": benchmark._hash(dict(project.world.files)), "image_id": image_id,
                        "evidence": "unit-test-world"}

            def close(self):
                pass

        class Actor:
            def __init__(self, **options):
                self.code = options["files"]["policy.py"]
                self.image_id = image_id

            def start(self):
                pass

            def act(self, observation):
                if self.code == "timeout":
                    raise ActorError("timeout")
                return observation["target"] if "observation['target']" in self.code else 0

            def close(self):
                return {"cleanup_blocked": False, "container_name": None}

        return run_episode_campaign(project.task, candidates, image_id, timeout_seconds,
                                    adapter_factory=World, actor_factory=Actor, split=split, require_observed_failure=False)

    monkeypatch.setattr(benchmark, "_campaign", evaluate)
    return calls


def test_freeze_retains_a_failing_baseline_and_compacts_traces(runtime):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    assert receipt["status"] == "frozen"
    assert receipt["baseline_report"]["grader"]["status"] == "accepted"
    baseline = receipt["baseline_report"]["candidates"][0]["run"]
    assert baseline["status"] == "fail"
    assert baseline["episodes"][0]["return"] == pytest.approx(1.0)
    assert baseline["episodes"][0]["trajectory_steps"] == 2
    assert "transitions" not in baseline["episodes"][0]
    assert "initial_observation" not in baseline["episodes"][0]
    assert benchmark.validate_benchmark(receipt) == receipt
    assert runtime[0]["image"] == IMAGE
    assert len(benchmark._bytes(receipt)) <= benchmark.MAX_RECEIPT_BYTES


def test_freeze_does_not_require_the_current_process_to_fail(runtime):
    project = project_demo()
    task = replace(project.task, snapshots=replace(project.task.snapshots, observed=project.task.snapshots.reference))
    receipt = benchmark.freeze_benchmark(replace(project, task=task), image="local:test")
    assert receipt["status"] == "frozen"
    assert receipt["baseline_report"]["candidates"][0]["run"]["status"] == "pass"


def test_compare_uses_frozen_sources_image_and_cached_paired_baseline(runtime):
    project = project_demo()
    receipt = benchmark.freeze_benchmark(project, image="local:test")
    original = deepcopy(receipt)
    result = benchmark.compare_benchmark(receipt, {"repair": project.task.snapshots.reference})
    assert result["status"] == "accepted"
    assert result["split"] == "holdout"
    held_seeds = [episode.seed for episode in project.task.episodes if episode.split == "holdout"]
    assert result["paired_deltas"][0]["sample_count"] == len(held_seeds)
    assert result["paired_deltas"][0]["complete_pairs"] == len(held_seeds)
    assert result["paired_deltas"][0]["mean_return_delta"] == pytest.approx(1.0)
    assert [row["seed"] for row in result["baseline"]["episodes"]] == held_seeds
    assert runtime[-1]["image"] == IMAGE
    assert runtime[-1]["project"] == receipt["project"]
    assert receipt == original


def test_development_mode_does_not_execute_holdout_episodes(runtime):
    project = project_demo()
    receipt = benchmark.freeze_benchmark(project, image="local:test")
    result = benchmark.compare_benchmark(receipt, {"repair": project.task.snapshots.reference}, split="development")
    assert runtime[-1]["split"] == "development"
    assert [row["seed"] for row in result["baseline"]["episodes"]] == [episode.seed for episode in project.task.episodes if episode.split == "development"]
    assert all(row["split"] == "development" for row in result["candidate_report"]["candidates"][0]["run"]["episodes"])


def test_incomplete_candidates_remain_in_pair_counts(runtime):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    result = benchmark.compare_benchmark(receipt, {"timeout": {"policy.py": "timeout"}})
    pair = result["paired_deltas"][0]
    assert pair["sample_count"] == sum(episode.split == "holdout" for episode in project_demo().task.episodes)
    assert pair["complete_pairs"] == 0
    assert pair["mean_return_delta"] is None
    assert pair["pairs"][0]["return_delta"] is None
    assert result["status"] == "inconclusive"


def test_invalid_runtime_cannot_create_a_comparable_freeze(runtime, monkeypatch):
    def unavailable(image, endpoint):
        raise RuntimeError("Local image unavailable.")

    monkeypatch.setattr(benchmark, "_image_id", unavailable)
    receipt = benchmark.freeze_benchmark(project_demo(), image="missing")
    assert receipt["status"] == "inconclusive"
    assert receipt["reason"] == "runtime-unavailable"
    assert receipt["baseline_report"] is None
    with pytest.raises(ValueError, match="frozen"):
        benchmark.compare_benchmark(receipt, {"repair": {"policy.py": "unused"}})
    assert runtime == []


@pytest.mark.parametrize("mutation", ["project", "unknown", "baseline-source", "return-verdict"])
def test_invalid_receipts_never_start_candidate_execution(runtime, mutation):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    if mutation == "project":
        receipt["project"]["brief"] = "Changed narrative"
    elif mutation == "unknown":
        receipt["extra"] = "unknown"
    elif mutation == "baseline-source":
        receipt["baseline_report"]["baseline"]["episodes"][0]["candidate_hash"] = "c" * 64
    else:
        receipt["baseline_report"]["baseline"]["episodes"][0]["return"] = 1000
    receipt["integrity_hash"] = benchmark._hash({key: value for key, value in receipt.items() if key != "integrity_hash"})
    with pytest.raises(ValueError):
        benchmark.compare_benchmark(receipt, {"repair": {"policy.py": "unused"}})
    assert len(runtime) == 1


def test_rejects_unbound_changes_and_returns_an_independent_validation(runtime):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    validated = benchmark.validate_benchmark(receipt)
    validated["project"]["brief"] = "Changed copy"
    assert receipt["project"]["brief"] != "Changed copy"
    receipt["timeout_seconds"] = 6
    with pytest.raises(ValueError, match="changed"):
        benchmark.validate_benchmark(receipt)


def test_freeze_enforces_serialized_receipt_budget(runtime, monkeypatch):
    monkeypatch.setattr(benchmark, "MAX_RECEIPT_BYTES", 1)
    with pytest.raises(ValueError, match="10 MiB"):
        benchmark.freeze_benchmark(project_demo(), image="local:test")


def test_evaluator_drift_requires_a_new_benchmark(runtime, monkeypatch):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    monkeypatch.setattr(benchmark, "_evaluator_hash", lambda: "f" * 64)
    with pytest.raises(ValueError, match="regenerate"):
        benchmark.validate_benchmark(receipt)


def test_finite_extreme_returns_do_not_produce_infinite_deltas(runtime, monkeypatch):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    for row in receipt["baseline_report"]["candidates"][0]["run"]["episodes"]:
        row["return"] = -1e308
    receipt["integrity_hash"] = benchmark._hash({key: value for key, value in receipt.items() if key != "integrity_hash"})
    original = benchmark._campaign

    def extreme(*args):
        report = original(*args)
        for row in report["candidates"][0]["run"]["episodes"]:
            row["return"] = 1e308
        return report

    monkeypatch.setattr(benchmark, "_campaign", extreme)
    result = benchmark.compare_benchmark(receipt, {"repair": project_demo().task.snapshots.reference})
    pairs = result["paired_deltas"][0]["pairs"]
    assert all(row["return_delta"] is None for row in pairs)
    assert all(row["delta_reason"] == "arithmetic-overflow" for row in pairs)
    assert result["paired_deltas"][0]["mean_return_delta"] is None
    benchmark._bytes(result)


def test_goal_acceptance_does_not_claim_improvement_over_a_higher_baseline(runtime):
    project = project_demo()
    task = replace(project.task, snapshots=replace(project.task.snapshots, observed=project.task.snapshots.reference))
    receipt = benchmark.freeze_benchmark(replace(project, task=task), image="local:test")
    for row in receipt["baseline_report"]["candidates"][0]["run"]["episodes"]:
        row["return"] = 3.0
    receipt["integrity_hash"] = benchmark._hash({key: value for key, value in receipt.items() if key != "integrity_hash"})
    result = benchmark.compare_benchmark(receipt, {"goal-passing": project.task.snapshots.reference})
    comparison = result["paired_deltas"][0]
    assert comparison["status"] == "accepted"
    assert comparison["mean_return_delta"] == pytest.approx(-1.0)
    assert comparison["relative_outcome"] == "lower-return"


def test_freeze_requires_negative_control_failure_in_each_split(runtime, monkeypatch):
    original = benchmark._campaign

    def control_passes_holdout(*args):
        report = original(*args)
        for row in report["controls"][1]["run"]["episodes"]:
            if row["split"] == "holdout":
                row.update(status="pass", **{"return": 2.0})
        return report

    monkeypatch.setattr(benchmark, "_campaign", control_passes_holdout)
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    assert receipt["status"] == "inconclusive"
    assert receipt["reason"] == "baseline-incomplete-or-invalid"


def test_validation_rechecks_control_results_for_each_split(runtime):
    receipt = benchmark.freeze_benchmark(project_demo(), image="local:test")
    for row in receipt["baseline_report"]["controls"][1]["run"]["episodes"]:
        if row["split"] == "holdout":
            row.update(status="pass", **{"return": 2.0})
    receipt["integrity_hash"] = benchmark._hash({key: value for key, value in receipt.items() if key != "integrity_hash"})
    with pytest.raises(ValueError, match="split"):
        benchmark.validate_benchmark(receipt)
