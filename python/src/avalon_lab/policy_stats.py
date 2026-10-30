"""Report paired training-seed comparisons without treating tasks as independent seeds."""

import math
import random
from statistics import mean
from typing import Mapping

from .policy_evaluation import Evaluation


def evaluation_metrics(evaluations: tuple[Evaluation, ...]) -> dict[str, int | float]:
    if not evaluations:
        raise ValueError("Use at least one completed evaluation.")
    return {"episodes": len(evaluations), "valid": sum(item.outcome.valid for item in evaluations), "goal_complete": sum(item.outcome.goal_complete for item in evaluations), "prohibited_episodes": sum(item.outcome.prohibited_actions > 0 for item in evaluations), "prohibited_actions": sum(item.outcome.prohibited_actions for item in evaluations), "protected_breaches": sum(not item.outcome.protected_preserved for item in evaluations), "verdict_disagreements": sum(not item.outcome_matches for item in evaluations), "unseen_states": sum(item.unseen_states for item in evaluations), "valid_fraction": mean(int(item.outcome.valid) for item in evaluations), "proxy_return_mean": mean(item.proxy_return for item in evaluations)}


def paired_seed_summary(*, candidate: Mapping[int, float], baseline: Mapping[int, float], candidate_name: str, baseline_name: str, resamples: int = 2000, seed: int = 104729) -> dict[str, object]:
    if set(candidate) != set(baseline) or len(candidate) < 2:
        raise ValueError("Use the same two or more paired training seeds.")
    if type(resamples) is not int or not 100 <= resamples <= 100_000 or type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("Use a bounded bootstrap count and uint32 seed.")
    if not all(type(key) is int and 0 <= key <= 0xFFFFFFFF for key in candidate):
        raise ValueError("Use uint32 training seed labels.")
    if not all(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1 for value in (*candidate.values(), *baseline.values())):
        raise ValueError("Use finite per-seed fractions from zero through one.")
    seeds = sorted(candidate)
    differences = [float(candidate[item] - baseline[item]) for item in seeds]
    rng = random.Random(seed)
    boot = sorted(mean(rng.choices(differences, k=len(differences))) for _ in range(resamples))
    lower = boot[math.floor(0.025 * (resamples - 1))]
    upper = boot[math.ceil(0.975 * (resamples - 1))]
    return {"candidate": candidate_name, "baseline": baseline_name, "unit": "fraction", "seed_clusters": len(seeds), "seeds": seeds, "candidate_mean": mean(candidate.values()), "baseline_mean": mean(baseline.values()), "paired_difference_mean": mean(differences), "paired_differences": differences, "bootstrap_95_percentile": [lower, upper], "bootstrap_seed": seed, "bootstrap_resamples": resamples, "uncertainty": "Paired training-seed bootstrap conditional on the fixed synthetic task suite. It does not estimate unseen task-family performance."}
