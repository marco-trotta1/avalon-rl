"""Run a bounded NumPy policy on the built-in CartPole environment."""

from dataclasses import asdict, dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import stat
from time import perf_counter
from typing import NewType

import gymnasium as gym
import numpy as np
from numpy.typing import NDArray

from .sampling import parse_sampling_receipt
from .sampling_report import sampling_report_dict, write_sampling_json


type Matrix = NDArray[np.float64]
Seconds = NewType("Seconds", float)
ENVIRONMENT = "CartPole-v1"
ENTRY_POINT = "gymnasium.envs.classic_control.cartpole:CartPoleEnv"
ALGORITHM = "numpy-linear-softmax-reinforce-v1"
MAX_TRANSITIONS = 20_000
MAX_FILE_BYTES = 32 * 1024 * 1024
SCALE = np.array([2.4, 2.0, 0.2, 2.0], dtype=np.float64)
GRADIENT_LIMIT = 5.0
SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _integer(value: object, *, label: str, lower: int, upper: int) -> int:
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError(f"{label}: Use an integer from {lower} through {upper}.")
    return value


def _number(value: object, *, label: str, lower: float = -1e12, upper: float = 1e12) -> float:
    if type(value) not in (int, float) or not lower <= value <= upper or not math.isfinite(value):
        raise ValueError(f"{label}: Use a finite number within the documented limits.")
    return float(value)


def _object(value: object, *, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label}: Use exactly the documented fields.")
    return value


def _unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Remove duplicate JSON object keys.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Remove non-finite JSON constants.")


def _read_json(path: Path) -> tuple[object, str]:
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_FILE_BYTES:
            raise ValueError("Use a regular JSON file of at most 32 MiB.")
        payload = source.read(MAX_FILE_BYTES + 1)
    if len(payload) > MAX_FILE_BYTES:
        raise ValueError("The JSON input exceeds 32 MiB.")
    value = json.loads(payload.decode("utf-8"), object_pairs_hook=_unique, parse_constant=_invalid_constant)
    return value, hashlib.sha256(payload).hexdigest()


def _hash(value: object) -> str:
    payload = json.dumps(value, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def _producer() -> dict[str, str]:
    return {
        "algorithm_revision": ALGORITHM, "source_sha256": SOURCE_SHA256,
        "numpy": np.__version__, "gymnasium": gym.__version__, "python": platform.python_version(),
    }


def _cost() -> dict[str, object]:
    return {
        "external_api_usd": 0.0, "cpu_compute_usd": None, "host_agent_usd": None,
        "scope": "This local process calls no model service. Local compute and host-agent costs are unpriced.",
    }


def _latency(seconds: Seconds) -> dict[str, object]:
    return {
        "seconds": seconds, "sample_count": 1, "unit": "complete invocation",
        "uncertainty": "One execution supplies no latency interval.",
    }


def _check_registration() -> None:
    spec = gym.spec(ENVIRONMENT)
    if (
        spec.id != ENVIRONMENT or spec.entry_point != ENTRY_POINT
        or spec.additional_wrappers != () or type(spec.kwargs) is not dict or spec.kwargs
        or spec.nondeterministic is not False or spec.order_enforce is not True
        or spec.disable_env_checker is not False or spec.max_episode_steps != 500
    ):
        raise ValueError("The environment registration differs from the trusted CartPole registration.")


@dataclass(frozen=True)
class TrainConfig:
    environment: str = ENVIRONMENT
    seed: int = 7
    episodes: int = 30
    max_steps: int = 200
    learning_rate: float = 0.01
    discount: float = 0.99

    def __post_init__(self) -> None:
        if self.environment != ENVIRONMENT:
            raise ValueError("Select the supported CartPole-v1 environment.")
        _integer(self.seed, label="seed", lower=0, upper=0xFFFFFFFF)
        _integer(self.episodes, label="episodes", lower=1, upper=1000)
        _integer(self.max_steps, label="max_steps", lower=1, upper=500)
        if self.episodes * self.max_steps > MAX_TRANSITIONS:
            raise ValueError("The training budget exceeds 20,000 transitions.")
        rate = _number(self.learning_rate, label="learning_rate", lower=0, upper=0.1)
        if rate <= 0:
            raise ValueError("Use a positive learning rate of at most 0.1.")
        _number(self.discount, label="discount", lower=0, upper=1)


@dataclass(frozen=True)
class Checkpoint:
    config: TrainConfig
    weights: Matrix
    episode_seeds: tuple[int, ...]
    document_sha256: str
    parameter_sha256: str


def _features(observation: Matrix) -> Matrix:
    return np.append(np.clip(np.asarray(observation, dtype=np.float64) / SCALE, -10.0, 10.0), 1.0)


def policy_distribution(*, weights: Matrix, observation: Matrix) -> Matrix:
    logits = _features(observation) @ weights
    exponentials = np.exp(logits - np.max(logits))
    return exponentials / np.sum(exponentials)


def log_policy_gradient(*, weights: Matrix, observation: Matrix, action: int) -> Matrix:
    probabilities = policy_distribution(weights=weights, observation=observation)
    residual = -probabilities
    residual[action] += 1.0
    return np.outer(_features(observation), residual)


def discounted_returns(*, rewards: list[float], discount: float) -> list[float]:
    returns = [0.0] * len(rewards)
    running = 0.0
    for position in range(len(rewards) - 1, -1, -1):
        running = rewards[position] + discount * running
        returns[position] = running
    return returns


def _rollout(*, environment: gym.Env, weights: Matrix, rng: np.random.Generator, seed: int, max_steps: int, policy: str = "learned-stochastic", progress: list[dict[str, object]] | None = None) -> list[dict[str, object]]:
    observation, _ = environment.reset(seed=seed)
    rows = progress if progress is not None else []
    for position in range(max_steps):
        observation = np.asarray(observation, dtype=np.float64)
        if policy == "learned-stochastic":
            probabilities = policy_distribution(weights=weights, observation=observation)
            action = int(rng.choice(2, p=probabilities))
        elif policy == "uniform-random":
            action = int(rng.integers(2))
        elif policy == "angle-velocity-control":
            action = int(observation[2] + 0.25 * observation[3] > 0)
        else:
            raise ValueError("Select a documented evaluation policy.")
        next_observation, reward, terminated, truncated, _ = environment.step(action)
        row = {
            "position": position, "observation": observation.tolist(), "action": action,
            "reward": float(reward), "next_observation": np.asarray(next_observation, dtype=np.float64).tolist(),
            "terminated": bool(terminated), "truncated": bool(truncated),
        }
        if policy == "learned-stochastic":
            row["sampling"] = {
                "probabilities": probabilities.tolist(), "raw_logits": (_features(observation) @ weights).tolist(),
                "selected_logprob": float(np.log(probabilities[action])),
            }
        rows.append(row)
        observation = next_observation
        if terminated or truncated:
            return rows
    raise ValueError("The environment does not enforce the declared episode limit.")


def train_policy(*, output: Path, config: TrainConfig) -> dict[str, object]:
    _check_registration()
    output.mkdir(mode=0o700)
    started = perf_counter()
    rng = np.random.default_rng(config.seed)
    weights = rng.normal(0, 0.01, (5, 2))
    initial_hash = _hash(weights.tolist())
    history = []
    credits = []
    transitions, updates, baseline_count = 0, 0, 0
    baseline_sum = 0.0
    environment = None
    progress = []
    phase = "startup"
    try:
        environment = gym.make(ENVIRONMENT, max_episode_steps=config.max_steps)
        for episode_index in range(config.episodes):
            episode_seed = (config.seed + episode_index) % (2**32)
            baseline = baseline_sum / baseline_count if baseline_count else 0.0
            phase = "collection"
            rows = _rollout(environment=environment, weights=weights, rng=rng, seed=episode_seed, max_steps=config.max_steps, progress=progress)
            phase = "update"
            returns = discounted_returns(rewards=[row["reward"] for row in rows], discount=config.discount)
            gradient = np.zeros_like(weights)
            credit_rows = []
            for row, value in zip(rows, returns):
                position = row["position"]
                advantage = value - baseline
                discount_weight = config.discount ** position
                gradient += discount_weight * advantage * log_policy_gradient(
                    weights=weights, observation=np.array(row["observation"]), action=row["action"],
                )
                credit_rows.append({
                    "position": position, "reward": row["reward"], "return": value, "advantage": advantage,
                    "discount_weight": discount_weight, "role": "policy", "loss_mask": True,
                    "terminated": row["terminated"], "truncated": row["truncated"],
                })
            before_hash = _hash(weights.tolist())
            norm = float(np.linalg.norm(gradient))
            gradient *= min(1.0, GRADIENT_LIMIT / norm) if norm > 0 else 1.0
            before = weights.copy()
            weights += config.learning_rate * gradient
            if not np.all(np.isfinite(weights)):
                raise ValueError("The policy update produces non-finite parameters.")
            changed = not np.array_equal(before, weights)
            updates += int(changed)
            transitions += len(rows)
            history.append({
                "episode": episode_index, "seed": episode_seed, "transitions": len(rows),
                "undiscounted_return": sum(row["reward"] for row in rows),
                "terminated": rows[-1]["terminated"], "truncated": rows[-1]["truncated"],
                "baseline": baseline, "gradient_l2_before_clip": norm,
                "parameter_change_l2": float(np.linalg.norm(weights - before)), "parameter_update": changed,
                "parameter_sha256_before": before_hash, "parameter_sha256_after": _hash(weights.tolist()),
            })
            credits.append({"id": f"episode-{episode_index}", "group_id": f"episode-{episode_index}", "seed": episode_seed, "baseline": baseline, "steps": credit_rows})
            baseline_sum += sum(returns)
            baseline_count += len(returns)
            progress = []
        phase = "writing"
        training = {
            "episodes": len(history), "episode_seeds": [item["seed"] for item in history],
            "transitions": transitions, "attempted_updates": len(history), "updates": updates,
            "initial_parameter_sha256": initial_hash, "final_parameter_sha256": _hash(weights.tolist()),
        }
        checkpoint = {"format": "avalon.gym-policy/v1", "config": asdict(config), "producer": _producer(), "weights": weights.tolist(), "training": training}
        write_sampling_json(output / "checkpoint.json", checkpoint)
        credit = {"format": "avalon.gym-credit/v1", "discount": config.discount, "baseline_method": "mean-return-from-previous-episodes", "episodes": credits}
        write_sampling_json(output / "credit.json", credit)
        report = {
            "format": "avalon.gym-training/v1", "status": "complete", "config": asdict(config), "producer": _producer(),
            "training": training, "episodes": history, "checkpoint_sha256": hashlib.sha256((output / "checkpoint.json").read_bytes()).hexdigest(),
            "method": {
                "policy": "Linear softmax with a bias and fixed clipped observation scales.",
                "observation_scale": SCALE.tolist(), "feature_clip_absolute": 10,
                "gradient_clip_l2": GRADIENT_LIMIT, "baseline": "Mean return-to-go from completed previous episodes.",
                "objective": "Discounted return within the capped episode. Weight each score gradient by discount ** position.",
                "ending": "Both termination and truncation end the capped objective. Neither ending bootstraps a value.",
                "optimizer": "One clipped gradient-ascent update per completed episode.",
            },
            "latency": _latency(Seconds(perf_counter() - started)), "cost": _cost(),
            "limits": [
                "Training completion does not establish a learning gain. Evaluate a frozen checkpoint on reserved seeds.",
                "This adapter supports built-in CartPole only. It does not integrate PPO, TRL, or vLLM.",
                "The receipt records this process. Its hashes do not authenticate an external trainer.",
            ],
        }
        write_sampling_json(output / "training.json", report)
        return report
    except BaseException as error:
        write_sampling_json(output / "failure.json", {
            "format": "avalon.gym-training-failure/v1", "status": "interrupted" if isinstance(error, KeyboardInterrupt) else "failed",
            "exception_type": type(error).__name__, "completed_episodes": history,
            "completed_step_count": transitions + len(progress), "phase": phase,
            "incomplete_episode": None if not progress else {"episode": len(history), "steps": progress},
            "possible_unrecorded_step": phase == "collection",
            "parameter_updates": updates, "config": asdict(config),
            "latency": _latency(Seconds(perf_counter() - started)), "cost": _cost(),
        })
        raise
    finally:
        if environment is not None:
            environment.close()


def read_checkpoint(path: Path) -> Checkpoint:
    value, digest = _read_json(path)
    root = _object(value, keys={"format", "config", "producer", "weights", "training"}, label="checkpoint")
    if root["format"] != "avalon.gym-policy/v1":
        raise ValueError("Use the avalon.gym-policy/v1 checkpoint format.")
    config_values = _object(root["config"], keys=set(TrainConfig.__dataclass_fields__), label="config")
    config = TrainConfig(**config_values)
    producer = _object(root["producer"], keys=set(_producer()), label="producer")
    if any(not isinstance(item, str) or not 1 <= len(item) <= 100 or any(ord(char) < 32 for char in item) for item in producer.values()):
        raise ValueError("Use bounded strings for the producer versions and source identity.")
    if producer["algorithm_revision"] != ALGORITHM or producer["gymnasium"] != gym.__version__ or producer["numpy"] != np.__version__:
        raise ValueError("Use the recorded algorithm, Gymnasium version, and NumPy version.")
    if not isinstance(producer["source_sha256"], str) or re.fullmatch(r"[0-9a-f]{64}", producer["source_sha256"]) is None:
        raise ValueError("Use a source SHA-256 identity.")
    if producer["source_sha256"] != SOURCE_SHA256:
        raise ValueError("The checkpoint source differs from the installed adapter. Compatibility is not verified.")
    entries = root["weights"]
    if not isinstance(entries, list) or len(entries) != 5 or any(not isinstance(row, list) or len(row) != 2 for row in entries):
        raise ValueError("Use a 5 by 2 policy parameter matrix.")
    weights = np.array([[_number(item, label="parameter", lower=-1000, upper=1000) for item in row] for row in entries], dtype=np.float64)
    training = _object(root["training"], keys={"episodes", "episode_seeds", "transitions", "attempted_updates", "updates", "initial_parameter_sha256", "final_parameter_sha256"}, label="training")
    expected_seeds = [(config.seed + index) % (2**32) for index in range(config.episodes)]
    if not isinstance(training["episode_seeds"], list) or len(training["episode_seeds"]) != config.episodes:
        raise ValueError("Use one recorded seed for each training episode.")
    for seed in training["episode_seeds"]:
        _integer(seed, label="training episode seed", lower=0, upper=0xFFFFFFFF)
    _integer(training["episodes"], label="completed episodes", lower=config.episodes, upper=config.episodes)
    _integer(training["attempted_updates"], label="attempted updates", lower=config.episodes, upper=config.episodes)
    if training["episode_seeds"] != expected_seeds or training["episodes"] != config.episodes or training["attempted_updates"] != config.episodes:
        raise ValueError("The checkpoint does not declare the complete training episode identities.")
    _integer(training["transitions"], label="transitions", lower=config.episodes, upper=config.episodes * config.max_steps)
    _integer(training["updates"], label="updates", lower=0, upper=config.episodes)
    initial = np.random.default_rng(config.seed).normal(0, 0.01, (5, 2)).tolist()
    if training["initial_parameter_sha256"] != _hash(initial) or training["final_parameter_sha256"] != _hash(weights.tolist()):
        raise ValueError("The checkpoint parameter identity does not match its parameters.")
    if training["updates"] == 0 and training["initial_parameter_sha256"] != training["final_parameter_sha256"]:
        raise ValueError("Zero declared updates cannot change the policy parameters.")
    _check_registration()
    weights.setflags(write=False)
    return Checkpoint(config, weights, tuple(expected_seeds), digest, _hash(weights.tolist()))


def _interval(values: list[float], *, seed: int = 104729) -> list[float]:
    rng = np.random.default_rng(seed)
    resamples = np.sort(np.mean(rng.choice(values, size=(2000, len(values)), replace=True), axis=1))
    return [float(resamples[math.floor(0.025 * 1999)]), float(resamples[math.ceil(0.975 * 1999)])]


def evaluate_checkpoint(*, checkpoint: Path, seeds: tuple[int, ...], max_steps: int = 500) -> dict[str, object]:
    model = read_checkpoint(checkpoint)
    if not 2 <= len(seeds) <= 64 or len(set(seeds)) != len(seeds):
        raise ValueError("Use 2 to 64 distinct evaluation seeds.")
    for seed in seeds:
        _integer(seed, label="evaluation seed", lower=0, upper=0xFFFFFFFF)
    _integer(max_steps, label="max_steps", lower=1, upper=500)
    if set(seeds) & set(model.episode_seeds):
        raise ValueError("Evaluation seeds overlap the recorded training seeds.")
    started = perf_counter()
    policies = {}
    environment = gym.make(ENVIRONMENT, max_episode_steps=max_steps)
    try:
        for name in ("learned-stochastic", "uniform-random", "angle-velocity-control"):
            records = []
            for seed in seeds:
                before = perf_counter()
                rows = _rollout(environment=environment, weights=model.weights, rng=np.random.default_rng(seed ^ 0x5A17), seed=seed, max_steps=max_steps, policy=name)
                records.append({"seed": seed, "return": sum(row["reward"] for row in rows), "transitions": len(rows), "terminated": rows[-1]["terminated"], "truncated": rows[-1]["truncated"], "elapsed_seconds": Seconds(perf_counter() - before)})
            returns = [item["return"] for item in records]
            policies[name] = {
                "sample_count": len(records), "unit": "one CartPole episode per reserved reset seed", "returns": returns,
                "mean_return": float(np.mean(returns)), "bootstrap_95_percentile": _interval(returns),
                "elapsed_seconds": sum(item["elapsed_seconds"] for item in records), "episodes": records,
            }
    finally:
        environment.close()
    comparisons = []
    candidate = policies["learned-stochastic"]["returns"]
    for name in ("uniform-random", "angle-velocity-control"):
        baseline = policies[name]["returns"]
        differences = [left - right for left, right in zip(candidate, baseline)]
        comparisons.append({
            "candidate": "learned-stochastic", "baseline": name, "unit": "undiscounted episode return",
            "sample_count": len(seeds), "paired_differences": differences, "mean_difference": float(np.mean(differences)),
            "bootstrap_95_percentile": _interval(differences),
        })
    return {
        "format": "avalon.gym-evaluation/v1", "policy_sha256": model.document_sha256,
        "parameter_sha256": model.parameter_sha256, "producer": _producer(), "environment": ENVIRONMENT,
        "seeds": list(seeds), "max_steps": max_steps, "policies": policies, "comparisons": comparisons,
        "training_updates_during_evaluation": 0, "bootstrap_seed": 104729, "bootstrap_resamples": 2000,
        "latency": _latency(Seconds(perf_counter() - started)), "cost": _cost(),
        "limits": [
            "The paired seed bootstrap conditions on this checkpoint and environment. It does not measure training-seed variation or new task families.",
            "One stochastic rollout per policy and reset seed combines environment and action-sampling variation.",
            "The angle-velocity baseline selects right when pole angle plus 0.25 times angular velocity is positive.",
            "Reserved seed disjointness does not establish an externally blind evaluation.",
        ],
    }


def record_probabilities(*, checkpoint: Path, output: Path, seed: int = 2001, episodes: int = 2, max_steps: int = 100) -> dict[str, object]:
    model = read_checkpoint(checkpoint)
    _integer(seed, label="seed", lower=0, upper=0xFFFFFFFF)
    _integer(episodes, label="episodes", lower=1, upper=4096)
    _integer(max_steps, label="max_steps", lower=1, upper=500)
    if episodes * max_steps > 4096:
        raise ValueError("The probability capture exceeds 4096 transitions.")
    output.mkdir(mode=0o700)
    started = perf_counter()
    rng = np.random.default_rng(seed)
    environment = gym.make(ENVIRONMENT, max_episode_steps=max_steps)
    rollouts, captured = [], []
    try:
        for episode_index in range(episodes):
            episode_seed = (seed + episode_index) % (2**32)
            rows = _rollout(environment=environment, weights=model.weights, rng=rng, seed=episode_seed, max_steps=max_steps)
            rollouts.append({"episode": episode_index, "seed": episode_seed, "steps": rows})
            for row in rows:
                sampling = row["sampling"]
                captured.append({
                    "sample_id": f"episode-{episode_index}", "group_id": f"episode-{episode_index}",
                    "token_position": row["position"], "sampled_token_id": row["action"], "role": "policy", "loss_mask": True,
                    "selected_logprob": {"kind": "known", "value": sampling["selected_logprob"]},
                    "support": {"kind": "captured", "token_ids": [index for index, probability in enumerate(sampling["probabilities"]) if probability > 0]},
                    "raw_logits": {"kind": "known", "values": sampling["raw_logits"]}, "processors": [],
                })
    finally:
        environment.close()
    context_hash = _hash({"checkpoint_sha256": model.document_sha256, "environment": ENVIRONMENT, "rollouts": rollouts})
    replayed = []
    for episode in rollouts:
        for row in episode["steps"]:
            features = np.append(np.clip(np.asarray(row["observation"], dtype=np.float64) / SCALE, -10.0, 10.0), 1.0)
            logits = np.einsum("i,ij->j", features, model.weights)
            maximum = float(np.max(logits))
            log_normalizer = maximum + math.log(sum(math.exp(float(value) - maximum) for value in logits))
            probabilities = [math.exp(float(value) - log_normalizer) for value in logits]
            replayed.append({
                "sample_id": f"episode-{episode['episode']}", "group_id": f"episode-{episode['episode']}",
                "token_position": row["position"], "sampled_token_id": row["action"], "role": "policy", "loss_mask": True,
                "selected_logprob": {"kind": "known", "value": float(logits[row["action"]]) - log_normalizer},
                "support": {"kind": "captured", "token_ids": [index for index, value in enumerate(probabilities) if value > 0]},
                "raw_logits": {"kind": "known", "values": logits.tolist()}, "processors": [],
            })
    source = {"format": "avalon.sampling/v1", "producer": {"name": "avalon.gym-sampler", "version": "1", "revision": SOURCE_SHA256}, "context_hash": context_hash, "samples": captured}
    target = {"format": "avalon.sampling/v1", "producer": {"name": "avalon.gym-learner-replay", "version": "1", "revision": SOURCE_SHA256}, "context_hash": context_hash, "samples": replayed}
    report = sampling_report_dict(source=parse_sampling_receipt(source), target=parse_sampling_receipt(target), tolerance=1e-9)
    report["capture"] = {"environment": ENVIRONMENT, "checkpoint_sha256": model.document_sha256, "transitions": len(captured), "seeds": [item["seed"] for item in rollouts], "producer": _producer()}
    report["latency"] = _latency(Seconds(perf_counter() - started))
    report["cost"] = _cost()
    report["limits"].append("The actions are CartPole decisions represented as categorical token IDs. This is not language-model sampling.")
    write_sampling_json(output / "rollout.json", {"format": "avalon.gym-rollout/v1", "checkpoint_sha256": model.document_sha256, "context_hash": context_hash, "episodes": rollouts})
    write_sampling_json(output / "source.json", source)
    write_sampling_json(output / "target.json", target)
    write_sampling_json(output / "report.json", report)
    return report


def audit_credit(*, source: Path, tolerance: float = 1e-9) -> dict[str, object]:
    tolerance = _number(tolerance, label="tolerance", lower=0, upper=1e-3)
    value, digest = _read_json(source)
    root = _object(value, keys={"format", "discount", "baseline_method", "episodes"}, label="credit")
    if root["format"] != "avalon.gym-credit/v1" or root["baseline_method"] != "mean-return-from-previous-episodes":
        raise ValueError("Use the avalon.gym-credit/v1 format and declared baseline method.")
    discount = _number(root["discount"], label="discount", lower=0, upper=1)
    if not isinstance(root["episodes"], list) or not 1 <= len(root["episodes"]) <= 1000:
        raise ValueError("Use 1 to 1000 credit episodes.")
    parsed, total = [], 0
    for index, value in enumerate(root["episodes"]):
        episode = _object(value, keys={"id", "group_id", "seed", "baseline", "steps"}, label="episode")
        for label in ("id", "group_id"):
            if not isinstance(episode[label], str) or re.fullmatch(r"[A-Za-z0-9_-]{1,80}", episode[label]) is None:
                raise ValueError("Use bounded episode and group labels.")
        _integer(episode["seed"], label="episode seed", lower=0, upper=0xFFFFFFFF)
        _number(episode["baseline"], label="baseline")
        if not isinstance(episode["steps"], list) or not 1 <= len(episode["steps"]) <= 500:
            raise ValueError("Use 1 to 500 steps per credit episode.")
        total += len(episode["steps"])
        if total > MAX_TRANSITIONS:
            raise ValueError("The credit receipt exceeds 20,000 transitions.")
        rows = []
        for raw in episode["steps"]:
            row = _object(raw, keys={"position", "reward", "return", "advantage", "discount_weight", "role", "loss_mask", "terminated", "truncated"}, label="credit step")
            _integer(row["position"], label="position", lower=0, upper=499)
            for key in ("reward", "return", "advantage", "discount_weight"):
                _number(row[key], label=key)
            for key in ("loss_mask", "terminated", "truncated"):
                if type(row[key]) is not bool:
                    raise ValueError("Use boolean masks and episode endings.")
            if row["role"] not in ("policy", "tool", "context", "padding"):
                raise ValueError("Use a documented decision role.")
            rows.append(row)
        parsed.append((episode, rows))
    findings = []
    seen_ids, seen_groups, seen_seeds = set(), set(), set()
    baseline_sum, baseline_count = 0.0, 0

    def finding(rule: str, episode: int, position: int | None, matches: bool) -> None:
        findings.append({"rule": rule, "episode": episode, "position": position, "status": "match" if matches else "mismatch"})

    for episode_index, (episode, rows) in enumerate(parsed):
        finding("episode-identity", episode_index, None, episode["id"] not in seen_ids)
        finding("group-boundary", episode_index, None, episode["group_id"] == episode["id"] and episode["group_id"] not in seen_groups)
        finding("seed-identity", episode_index, None, episode["seed"] not in seen_seeds)
        seen_ids.add(episode["id"])
        seen_groups.add(episode["group_id"])
        seen_seeds.add(episode["seed"])
        baseline = baseline_sum / baseline_count if baseline_count else 0.0
        finding("prior-episode-baseline", episode_index, None, abs(episode["baseline"] - baseline) <= tolerance)
        returns = discounted_returns(rewards=[row["reward"] for row in rows], discount=discount)
        for position, (row, expected_return) in enumerate(zip(rows, returns)):
            finding("position", episode_index, position, row["position"] == position)
            finding("discounted-return", episode_index, position, abs(row["return"] - expected_return) <= tolerance)
            finding("advantage", episode_index, position, abs(row["advantage"] - (expected_return - baseline)) <= tolerance)
            finding("discount-weight", episode_index, position, abs(row["discount_weight"] - discount ** position) <= tolerance)
            finding("policy-role", episode_index, position, row["role"] == "policy")
            finding("active-action-mask", episode_index, position, row["loss_mask"])
            ending = row["terminated"] or row["truncated"]
            finding("episode-ending", episode_index, position, ending if position == len(rows) - 1 else not ending)
        baseline_sum += sum(returns)
        baseline_count += len(returns)
    return {
        "format": "avalon.gym-credit-audit/v1", "status": "fail" if any(item["status"] == "mismatch" for item in findings) else "pass",
        "source_sha256": digest, "absolute_tolerance": tolerance, "episodes": len(parsed), "transitions": total,
        "summary": {status: sum(item["status"] == status for item in findings) for status in ("match", "mismatch")},
        "findings": findings,
        "limits": [
            "The checks replay the declared capped REINFORCE assignments. They do not establish causal action importance.",
            "This format describes Gymnasium policy decisions. It does not support language-model advantage schemes.",
            "The receipt does not authenticate an external trainer or prove that it applied the declared loss.",
        ],
    }
