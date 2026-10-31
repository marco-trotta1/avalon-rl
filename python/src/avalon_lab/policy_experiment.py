"""Run a frozen CPU policy experiment and preserve every condition and seed."""

from dataclasses import asdict, dataclass
from importlib.metadata import version
import hashlib
from pathlib import Path
import platform
import resource
from time import perf_counter

from .policy_evaluation import evaluate_baseline, evaluate_policy
from .policy_export import write_policy_evidence
from .policy_holdout import HoldoutManifest, freeze_holdout, load_evaluation, load_training
from .policy_mdp import ARMS, RewardArm, digest
from .policy_schedule import Schedule, train_schedule
from .policy_stats import evaluation_metrics, paired_seed_summary
from .snapshot import write_json


@dataclass(frozen=True)
class ExperimentPlan:
    learner_seeds: tuple[int, ...] = tuple(range(20))
    interactions: int = 2400
    horizon: int = 4
    learning_rate: float = 0.3
    discount: float = 0.95
    epsilon: float = 0.2
    arms: tuple[RewardArm, ...] = ARMS
    schedules: tuple[Schedule, ...] = ("fixed", "random", "disagreement")
    training_generator_seeds: tuple[int, ...] = (7, 8)
    same_family_generator_seeds: tuple[int, ...] = (1007, 1008, 1009, 1010)
    family_generator_seeds: tuple[int, ...] = (2007, 2008, 2009, 2010)
    bootstrap_resamples: int = 2000
    bootstrap_seed: int = 104729
    evaluation_seed_base: int = 1000003


def _validate_plan(plan: ExperimentPlan, manifest: HoldoutManifest) -> None:
    if not 2 <= len(plan.learner_seeds) <= 100 or len(set(plan.learner_seeds)) != len(plan.learner_seeds) or any(type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF for seed in plan.learner_seeds):
        raise ValueError("Use 2 to 100 distinct uint32 learner seeds.")
    if type(plan.horizon) is not int or not 1 <= plan.horizon <= 6 or type(plan.bootstrap_seed) is not int or not 0 <= plan.bootstrap_seed <= 0xFFFFFFFF:
        raise ValueError("Use a bounded integer horizon and uint32 bootstrap seed.")
    for seeds in (plan.training_generator_seeds, plan.same_family_generator_seeds, plan.family_generator_seeds):
        if not seeds or len(set(seeds)) != len(seeds) or any(type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF for seed in seeds):
            raise ValueError("Use distinct uint32 generator seeds in every partition.")
    if plan.arms != ARMS or plan.schedules != ("fixed", "random", "disagreement"):
        raise ValueError("Keep all three reward arms and all three schedule baselines.")
    if type(plan.bootstrap_resamples) is not int or not 100 <= plan.bootstrap_resamples <= 100_000:
        raise ValueError("Use 100 to 100,000 paired bootstrap resamples.")
    if type(plan.evaluation_seed_base) is not int or not 0 <= plan.evaluation_seed_base <= 0xFFFFFFFF:
        raise ValueError("Use a uint32 evaluation seed base.")
    expected = {"train": plan.training_generator_seeds, "same-family": plan.same_family_generator_seeds, "family": plan.family_generator_seeds}
    expected_tasks = {"train": {"settle-a", "settle-b"}, "same-family": {"settle-a", "settle-b"}, "family": {"close-ticket", "settle-and-close"}}
    for partition, seeds in expected.items():
        records = manifest.partition(partition)
        if {item.seed for item in records} != set(seeds) or {(item.task_id, item.seed) for item in records} != {(task, seed) for task in expected_tasks[partition] for seed in seeds}:
            raise ValueError("The task and generator-seed inventory must match the frozen plan.")
        if any(item.horizon != plan.horizon for item in records):
            raise ValueError("Every table must preserve the frozen experiment horizon.")


def _comparisons(rows: list[dict[str, object]], plan: ExperimentPlan) -> list[dict[str, object]]:
    comparisons = []
    for partition in ("same-family", "family"):
        for arm in plan.arms:
            for baseline_schedule in ("fixed", "random"):
                candidate = {row["seed"]: row["metrics"][partition]["valid_fraction"] for row in rows if row["arm"] == arm and row["schedule"] == "disagreement"}
                baseline = {row["seed"]: row["metrics"][partition]["valid_fraction"] for row in rows if row["arm"] == arm and row["schedule"] == baseline_schedule}
                comparisons.append({"partition": partition, **paired_seed_summary(candidate=candidate, baseline=baseline, candidate_name=f"{arm}/disagreement", baseline_name=f"{arm}/{baseline_schedule}", resamples=plan.bootstrap_resamples, seed=plan.bootstrap_seed)})
        for schedule in plan.schedules:
            candidate = {row["seed"]: row["metrics"][partition]["valid_fraction"] for row in rows if row["arm"] == "history" and row["schedule"] == schedule}
            baseline = {row["seed"]: row["metrics"][partition]["valid_fraction"] for row in rows if row["arm"] == "final" and row["schedule"] == schedule}
            comparisons.append({"partition": partition, **paired_seed_summary(candidate=candidate, baseline=baseline, candidate_name=f"history/{schedule}", baseline_name=f"final/{schedule}", resamples=plan.bootstrap_resamples, seed=plan.bootstrap_seed)})
    return comparisons


def run_policy_experiment(*, train_paths: tuple[Path, ...], same_family_paths: tuple[Path, ...], family_paths: tuple[Path, ...], output: Path, plan: ExperimentPlan = ExperimentPlan()) -> dict[str, object]:
    manifest = freeze_holdout(train_paths=train_paths, same_family_paths=same_family_paths, family_paths=family_paths)
    _validate_plan(plan, manifest)
    # Validate learning parameters before creating a result directory or updating weights.
    from .policy_learning import training_config
    training_config(seed=plan.learner_seeds[0], interactions=plan.interactions, arm=plan.arms[0], learning_rate=plan.learning_rate, discount=plan.discount, epsilon=plan.epsilon)
    frozen_plan = {"format": "avalon.policy-plan/v1", "plan": asdict(plan), "manifest_hash": manifest.hash}
    plan_hash = digest(frozen_plan)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    rows: list[dict[str, object]] = []
    baseline_rows = []
    started = perf_counter()
    try:
        runs_path = output / "runs"
        runs_path.mkdir(mode=0o700)
        snapshots_path = output / "snapshots"
        snapshots_path.mkdir(mode=0o700)
        write_json(output / "plan.json", {**frozen_plan, "hash": plan_hash})
        write_json(output / "holdout.json", manifest.to_dict())
        training_tables = load_training(manifest)
        for seed in plan.learner_seeds:
            for arm in plan.arms:
                for schedule in plan.schedules:
                    train_started = perf_counter()
                    run = train_schedule(training_tables, seed=seed, interactions=plan.interactions, arm=arm, schedule=schedule, learning_rate=plan.learning_rate, discount=plan.discount, epsilon=plan.epsilon)
                    training_ms = (perf_counter() - train_started) * 1000
                    policy = run.training.policy
                    evaluation_started = perf_counter()
                    scores = {}
                    evaluations = {}
                    all_tables = []
                    all_evaluations = []
                    for partition in ("same-family", "family"):
                        tables = load_evaluation(manifest, policy=policy, partition=partition)
                        results = tuple(evaluate_policy(table, policy=policy, seed=(plan.evaluation_seed_base + seed * 4099 + index * 131) & 0xFFFFFFFF, arm=arm) for index, table in enumerate(tables))
                        all_tables.extend(tables)
                        all_evaluations.extend(results)
                        scores[partition] = evaluation_metrics(results)
                        evaluations[partition] = [asdict(item) for item in results]
                        if schedule == "fixed":
                            for baseline in ("random", "known-good"):
                                baseline_started = perf_counter()
                                controls = tuple(evaluate_baseline(table, baseline=baseline, seed=(plan.evaluation_seed_base + seed * 4099 + index * 131) & 0xFFFFFFFF, arm=arm) for index, table in enumerate(tables))
                                baseline_rows.append({"seed": seed, "arm": arm, "baseline": baseline, "partition": partition, "training_interactions": 0, "latency_ms": {"evaluation": (perf_counter() - baseline_started) * 1000, "samples": 1, "uncertainty": "Not estimated for one control and seed."}, "metrics": evaluation_metrics(controls), "episodes": [asdict(item) for item in controls]})
                    evaluation_ms = (perf_counter() - evaluation_started) * 1000
                    snapshot_hashes = write_policy_evidence(tables=tuple(all_tables), evaluations=tuple(all_evaluations), seed=seed, directory=snapshots_path, name=f"seed-{seed}-{arm}-{schedule}")
                    updates = [asdict(item) for item in run.training.updates]
                    row = {"seed": seed, "arm": arm, "schedule": schedule, "policy_hash": policy.hash, "updates_hash": digest(updates), "interaction_count": len(updates), "changed_updates": run.training.changed_updates, "training_episodes": len(run.episodes), "snapshot_hashes": snapshot_hashes, "metrics": scores, "latency_ms": {"training": training_ms, "evaluation": evaluation_ms, "samples": 1, "scope": "Evaluation includes frozen-table loading. The fixed schedule also measures random and known-good controls.", "uncertainty": "Not estimated for one condition and seed."}}
                    write_json(runs_path / f"seed-{seed}-{arm}-{schedule}.json", {**row, "config": asdict(run.training.config), "policy": asdict(policy), "updates": updates, "training_episode_receipts": [asdict(item) for item in run.episodes], "evaluations": evaluations})
                    rows.append(row)
        elapsed_ms = (perf_counter() - started) * 1000
        comparisons = _comparisons(rows, plan)
        negative = ["The history reward is the simple complete assertion baseline. No detection advantage over that assertion is claimed.", "No mutation-family holdout is available from the complete reachable training tables."]
        for item in comparisons:
            if item["bootstrap_95_percentile"][0] <= 0 <= item["bootstrap_95_percentile"][1]:
                negative.append(f'{item["candidate"]} has no positive paired interval against {item["baseline"]} on {item["partition"]}.')
        semantic_rows = [{key: value for key, value in row.items() if key != "latency_ms"} for row in rows]
        report = {"format": "avalon.policy-experiment/v1", "evidence": "synthetic", "plan_hash": plan_hash, "holdout_hash": manifest.hash, "plan": asdict(plan), "runs": rows, "baselines": baseline_rows, "paired_comparisons": comparisons, "semantic_result_hash": digest(semantic_rows), "source_hashes": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(Path(__file__).parent.glob("policy_*.py"))}, "versions": {"python": platform.python_version(), "avalon-rl-lab": version("avalon-rl-lab"), "numpy": version("numpy")}, "hardware": {"system": platform.system(), "machine": platform.machine(), "processor": platform.processor()}, "latency": {"total_ms": elapsed_ms, "samples": 1, "scope": "Training, evaluation, and per-run writes. Input freeze and final summary write are excluded.", "uncertainty": "One local experiment. Per-run timings are also retained."}, "memory": {"peak_process_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if platform.system() == "Darwin" else 1024), "samples": 1, "scope": "Process high-water mark, including the interpreter and earlier imports."}, "api_calls": 0, "api_cost_usd": 0, "local_compute_cost_usd": None, "local_compute_cost_status": "unpriced", "negative_results": negative, "limits": ["The independent evaluator shares the published task specification with the TypeScript verifier.", "Hashes bind supplied inert artifacts. They do not authenticate reducer execution.", "Seed intervals condition on the fixed synthetic evaluation suite.", "No external benchmark defect, user demand, algorithmic novelty, or production policy improvement is established."]}
        write_json(output / "report.json", report)
        return report
    except Exception as error:
        write_json(output / "failure.json", {"plan_hash": plan_hash, "completed_runs": len(rows), "error": type(error).__name__, "message": str(error)})
        raise
