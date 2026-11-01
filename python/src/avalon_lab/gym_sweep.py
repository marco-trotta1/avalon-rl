"""Train a frozen CartPole roster and record bounded selection evidence."""

from dataclasses import dataclass
import hashlib
from importlib.metadata import version
import json
import math
import os
from pathlib import Path
import platform
import random
import re
import stat
from time import perf_counter
from typing import NewType

from .gym_training import SOURCE_SHA256, TrainConfig, evaluate_checkpoint, train_policy
from .sampling_report import write_sampling_json


Milliseconds = NewType("Milliseconds", float)
EpisodeReturn = NewType("EpisodeReturn", float)
Probability = NewType("Probability", float)
UINT32_SIZE = 2**32
MAX_CONFIG_BYTES = 64 * 1024
MAX_SWEEP_TRANSITIONS = 80_000


@dataclass(frozen=True)
class SweepCandidate:
    id: str
    training: TrainConfig


@dataclass(frozen=True)
class SweepConfig:
    candidates: tuple[SweepCandidate, ...]
    evaluation_seed: int
    evaluation_episodes: int
    evaluation_max_steps: int
    delta: Probability
    min_improvement: EpisodeReturn
    source_sha256: str


def _object(value: object, *, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label}: Use exactly the documented fields.")
    return value


def _integer(value: object, *, lower: int, upper: int, label: str) -> int:
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError(f"{label}: Use an integer from {lower} through {upper}.")
    return value


def _number(value: object, *, lower: float, upper: float, label: str) -> float:
    if type(value) not in (int, float) or not lower <= value <= upper or not math.isfinite(value):
        raise ValueError(f"{label}: Use a finite number within the documented limits.")
    return float(value)


def _unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Remove duplicate JSON keys.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Remove non-finite JSON constants.")


def read_sweep_config(path: Path) -> SweepConfig:
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_CONFIG_BYTES:
            raise ValueError("Use a regular configuration file of at most 64 KiB.")
        payload = source.read(MAX_CONFIG_BYTES + 1)
    if len(payload) > MAX_CONFIG_BYTES:
        raise ValueError("The configuration exceeds 64 KiB.")
    value = json.loads(payload.decode("utf-8"), object_pairs_hook=_unique, parse_constant=_invalid_constant)
    root = _object(value, keys={"format", "evaluation", "delta", "minImprovement", "candidates"}, label="sweep")
    if root["format"] != "avalon-gym-sweep-v1":
        raise ValueError("Use the avalon-gym-sweep-v1 configuration format.")
    evaluation = _object(root["evaluation"], keys={"seed", "episodes", "maxSteps"}, label="evaluation")
    evaluation_seed = _integer(evaluation["seed"], lower=0, upper=UINT32_SIZE - 1, label="evaluation seed")
    evaluation_episodes = _integer(evaluation["episodes"], lower=2, upper=64, label="evaluation episodes")
    evaluation_max_steps = _integer(evaluation["maxSteps"], lower=1, upper=500, label="evaluation maxSteps")
    delta = _number(root["delta"], lower=0, upper=1, label="delta")
    if not 0 < delta < 1:
        raise ValueError("Use a delta greater than zero and less than one.")
    minimum = _number(root["minImprovement"], lower=0, upper=evaluation_max_steps, label="minImprovement")
    entries = root["candidates"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= 8:
        raise ValueError("Supply one through eight frozen training candidates.")
    candidates = []
    for entry in entries:
        row = _object(entry, keys={"id", "seed", "episodes", "maxSteps", "learningRate", "discount"}, label="candidate")
        identity = row["id"]
        if not isinstance(identity, str) or re.fullmatch(r"[a-z][a-z0-9-]{0,47}", identity) is None or identity == "random":
            raise ValueError("Use a candidate ID with lowercase letters, digits, or hyphens. Reserve random for the control.")
        candidates.append(SweepCandidate(identity, TrainConfig(
            seed=row["seed"], episodes=row["episodes"], max_steps=row["maxSteps"],
            learning_rate=row["learningRate"], discount=row["discount"],
        )))
    if len({item.id for item in candidates}) != len(candidates):
        raise ValueError("Use distinct candidate IDs.")
    if sum(item.training.episodes * item.training.max_steps for item in candidates) > MAX_SWEEP_TRANSITIONS:
        raise ValueError("The sweep training budget exceeds 80,000 transitions.")
    return SweepConfig(tuple(candidates), evaluation_seed, evaluation_episodes, evaluation_max_steps, Probability(delta), EpisodeReturn(minimum), hashlib.sha256(payload).hexdigest())


def _configuration(config: SweepConfig) -> dict[str, object]:
    return {
        "format": "avalon-gym-sweep-v1",
        "evaluation": {"seed": config.evaluation_seed, "episodes": config.evaluation_episodes, "maxSteps": config.evaluation_max_steps},
        "delta": config.delta, "minImprovement": config.min_improvement,
        "candidates": [{
            "id": item.id, "seed": item.training.seed, "episodes": item.training.episodes,
            "maxSteps": item.training.max_steps, "learningRate": item.training.learning_rate, "discount": item.training.discount,
        } for item in config.candidates],
    }


def _evaluation_seeds(config: SweepConfig) -> tuple[int, ...]:
    training_seeds = {(item.training.seed + index) % UINT32_SIZE for item in config.candidates for index in range(item.training.episodes)}
    draws = random.Random(config.evaluation_seed).sample(range(UINT32_SIZE), len(training_seeds) + config.evaluation_episodes)
    return tuple(seed for seed in draws if seed not in training_seeds)[:config.evaluation_episodes]


def _cost() -> dict[str, float | None]:
    return {"externalApiUsd": 0.0, "computeUsd": None, "hostAgentUsd": None}


def _elapsed(started: float) -> Milliseconds:
    return Milliseconds((perf_counter() - started) * 1000)


def _failure_reason(error: BaseException) -> str:
    return f"The workflow raises {type(error).__name__}. Keep the retained artifacts for inspection."


def _score(*, identity: str, artifact: str, policy: dict[str, object], seeds: tuple[int, ...], latency: Milliseconds) -> dict[str, object]:
    return {
        "id": identity, "artifactSha256": artifact, "status": "complete",
        "samples": [{"sampleId": str(seed), "value": value} for seed, value in zip(seeds, policy["returns"], strict=True)],
        "latencyMs": latency, "cost": _cost(),
    }


def run_sweep(*, config_path: Path, output: Path) -> dict[str, object]:
    config = read_sweep_config(config_path)
    seeds = _evaluation_seeds(config)
    output.mkdir(mode=0o700)
    started = perf_counter()
    training_rows = []
    failures = []
    phase = "configuration"
    current = None
    report = {
        "format": "avalon-gym-sweep-report-v1", "status": "failed",
        "configSourceSha256": config.source_sha256,
        "latencySampleCount": 1,
        "latencyScope": "Sweep execution after configuration parsing, excluding final report writes.",
        "latencyUncertainty": "One invocation supplies no latency interval.",
        "versions": {"python": platform.python_version(), "gymnasium": version("gymnasium"), "numpy": version("numpy")},
        "sources": {"gymTrainingSha256": SOURCE_SHA256, "gymSweepSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "declaredTrainingTransitions": sum(item.training.episodes * item.training.max_steps for item in config.candidates),
        "evaluationSeeds": list(seeds), "training": training_rows, "failures": failures, "cost": _cost(),
        "limits": [
            "The fixed roster is trained before the selection plan is written. Evaluation starts after the plan is written.",
            "Scores describe capped CartPole returns for frozen checkpoints over the eligible uint32 reset-seed population.",
            "Evaluation samples use uniform sampling without replacement. The PRNG seed fixes their reproducible realization.",
            "All candidates use the same eligible population, with every recorded training seed excluded.",
            "The evidence does not measure new environments, training-seed variation, or an externally blind holdout.",
            "Candidate latency includes training and learned-policy rollouts. Control latency includes uniform-random rollouts.",
            "Each latency measurement has one execution. No latency interval is estimated.",
            "The local process calls no model service. Local compute and host-agent costs remain unpriced.",
            "Training and evaluation completion do not establish an improvement. Run the separate selection command.",
        ],
    }
    try:
        write_sampling_json(output / "sweep-config.json", _configuration(config))
        (output / "candidates").mkdir(mode=0o700)
        phase = "training"
        for candidate in config.candidates:
            current = candidate.id
            before = perf_counter()
            result = train_policy(output=output / "candidates" / candidate.id, config=candidate.training)
            training_rows.append({"id": candidate.id, "artifactSha256": result["checkpoint_sha256"], "training": result["training"], "latencyMs": _elapsed(before)})
        control = hashlib.sha256(json.dumps({
            "policy": "uniform-random", "gymTrainingSha256": SOURCE_SHA256,
            "maxSteps": config.evaluation_max_steps, "versions": report["versions"],
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        plan = {
            "format": "avalon-selection-plan-v1", "baselineId": "random",
            "metric": {"name": "episode-return", "lower": 0, "upper": config.evaluation_max_steps, "direction": "maximize"},
            "delta": config.delta, "minImprovement": config.min_improvement,
            "sampling": {"unit": "evaluation-episode", "assumption": "uniform-without-replacement", "seed": config.evaluation_seed, "sampleIds": [str(seed) for seed in seeds]},
            "candidates": [{"id": "random", "artifactSha256": control}, *[{"id": row["id"], "artifactSha256": row["artifactSha256"]} for row in training_rows]],
        }
        phase = "plan"
        write_sampling_json(output / "selection-plan.json", plan)
        plan_hash = hashlib.sha256((output / "selection-plan.json").read_bytes()).hexdigest()
        phase = "evaluation"
        scores = []
        baseline = None
        for trained in training_rows:
            current = trained["id"]
            before = perf_counter()
            try:
                result = evaluate_checkpoint(checkpoint=output / "candidates" / current / "checkpoint.json", seeds=seeds, max_steps=config.evaluation_max_steps)
                if result["policy_sha256"] != trained["artifactSha256"]:
                    raise ValueError("The checkpoint differs from the frozen selection plan.")
                write_sampling_json(output / "candidates" / current / "evaluation.json", result)
                if baseline is None:
                    policy = result["policies"]["uniform-random"]
                    baseline = _score(identity="random", artifact=control, policy=policy, seeds=seeds, latency=Milliseconds(policy["elapsed_seconds"] * 1000))
                policy = result["policies"]["learned-stochastic"]
                scores.append(_score(identity=current, artifact=trained["artifactSha256"], policy=policy, seeds=seeds, latency=Milliseconds(trained["latencyMs"] + policy["elapsed_seconds"] * 1000)))
            except Exception as error:
                reason = _failure_reason(error)
                failures.append({"id": current, "phase": phase, "reason": reason})
                scores.append({"id": current, "artifactSha256": trained["artifactSha256"], "status": "failed", "reason": reason, "latencyMs": Milliseconds(trained["latencyMs"] + _elapsed(before)), "cost": _cost()})
        if baseline is None:
            baseline = {"id": "random", "artifactSha256": control, "status": "failed", "reason": "No complete evaluation records the control. No control samples are retained.", "latencyMs": Milliseconds(0.0), "cost": _cost()}
        phase = "scores"
        write_sampling_json(output / "selection-scores.json", {"format": "avalon-selection-scores-v1", "planSha256": plan_hash, "candidates": [baseline, *scores]})
        report["status"] = "failed" if failures else "complete"
        report["selectionPlanSha256"] = plan_hash
        report["selectionArtifacts"] = ["selection-plan.json", "selection-scores.json"]
    except BaseException as error:
        failures.append({"id": current, "phase": phase, "reason": _failure_reason(error)})
        report["status"] = "interrupted" if isinstance(error, KeyboardInterrupt) else "failed"
        report["phase"] = phase
        report["latencyMs"] = _elapsed(started)
        write_sampling_json(output / "failure.json", report)
        write_sampling_json(output / "report.json", report)
        if not isinstance(error, Exception):
            raise
        return report
    report["latencyMs"] = _elapsed(started)
    if failures:
        write_sampling_json(output / "failure.json", report)
    write_sampling_json(output / "report.json", report)
    return report
