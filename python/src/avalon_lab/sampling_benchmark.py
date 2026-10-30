"""Run a frozen synthetic census with explicit simple baselines."""

from copy import deepcopy
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path
import platform
import random
import statistics
import sys
import time
import tracemalloc

from .sampling import CapturedSupport, Known, SamplingReceipt, SamplingSample, audit_sampling_receipts, parse_sampling_receipt
from .sampling_report import Json


VARIANTS_PER_FAMILY = 4
FAMILIES = (
    ("support-permutation", "development", "fail"),
    ("processor-omission", "development", "fail"),
    ("mask-flip", "development", "fail"),
    ("active-tool", "development", "fail"),
    ("position-shift", "development", "fail"),
    ("recorded-probability", "development", "fail"),
    ("clean", "development", "pass"),
    ("unavailable-support", "development", "inconclusive"),
    ("hidden-distribution", "reserved", "fail"),
    ("processor-order", "reserved", "fail"),
    ("group-shift", "reserved", "fail"),
    ("unavailable-probability", "reserved", "inconclusive"),
    ("unavailable-logits", "reserved", "inconclusive"),
    ("unsupported-processor", "reserved", "inconclusive"),
    ("harmless-processors", "reserved", "pass"),
    ("nonpolicy", "reserved", "pass"),
    ("inactive", "reserved", "pass"),
    ("common-offset", "reserved", "pass"),
    ("support-order", "reserved", "pass"),
)


def _dense_reference(row: SamplingSample) -> tuple[float, tuple[float, ...]] | None:
    """Use a small dense assertion independent of the Avalon replay helpers."""
    if not isinstance(row.raw_logits, Known) or not isinstance(row.support, CapturedSupport):
        return None
    values = list(row.raw_logits.value)
    for step in row.processors:
        if any(token_id >= len(values) for token_id in step.token_ids):
            return None
        if step.name == "temperature":
            values = [value / step.value for value in values]
        elif step.name in ("logit_bias", "presence_penalty", "repetition_penalty"):
            for token_id in step.token_ids:
                if step.name == "logit_bias":
                    values[token_id] += step.value
                elif step.name == "presence_penalty":
                    values[token_id] -= step.value
                else:
                    values[token_id] = values[token_id] * step.value if values[token_id] < 0 else values[token_id] / step.value
        else:
            return None
    support = set(row.support.token_ids)
    if row.sampled_token_id not in support or any(token_id >= len(values) for token_id in support):
        return None
    offset = max(values[token_id] for token_id in support)
    weights = [math.exp(value - offset) if token_id in support else 0.0 for token_id, value in enumerate(values)]
    total = sum(weights)
    return values[row.sampled_token_id] - offset - math.log(total), tuple(value / total for value in weights)


def _baseline(*, source: SamplingReceipt, target: SamplingReceipt, method: str) -> str:
    before = {row.key: row for row in source.samples}
    after = {row.key: row for row in target.samples}
    if source.context_hash != target.context_hash or before.keys() != after.keys():
        return "fail"
    unknown = False
    for key, row in before.items():
        other = after[key]
        if row.sampled_token_id != other.sampled_token_id:
            return "fail"
        if method != "selected-logprob":
            if (row.group_id, row.role, row.loss_mask) != (other.group_id, other.role, other.loss_mask):
                return "fail"
            if any(item.role != "policy" and item.loss_mask for item in (row, other)):
                return "fail"
        if row.role != "policy" or other.role != "policy":
            continue
        active = row.loss_mask or other.loss_mask
        if method == "selected-logprob":
            if isinstance(row.selected_logprob, Known) and isinstance(other.selected_logprob, Known):
                if abs(row.selected_logprob.value - other.selected_logprob.value) > 1e-9:
                    return "fail"
            elif active:
                unknown = True
            continue
        if isinstance(row.support, CapturedSupport) and isinstance(other.support, CapturedSupport):
            if set(row.support.token_ids) != set(other.support.token_ids):
                return "fail"
            if row.sampled_token_id not in row.support.token_ids or other.sampled_token_id not in other.support.token_ids:
                return "fail"
        elif active:
            unknown = True
        if method == "complete-support":
            continue
        a, b = _dense_reference(row), _dense_reference(other)
        if a is None or b is None:
            unknown = unknown or active
            continue
        if len(a[1]) != len(b[1]) or any(abs(left - right) > 1e-9 for left, right in zip(a[1], b[1])):
            return "fail"
        for item, reference in ((row, a), (other, b)):
            if isinstance(item.selected_logprob, Known):
                if abs(item.selected_logprob.value - reference[0]) > 1e-9:
                    return "fail"
            elif active:
                unknown = True
        if isinstance(row.selected_logprob, Known) and isinstance(other.selected_logprob, Known):
            if abs(row.selected_logprob.value - other.selected_logprob.value) > 1e-9:
                return "fail"
    return "inconclusive" if unknown else "pass"


def _case(*, seed: int, family: str, variant: int) -> tuple[dict[str, object], dict[str, object]]:
    rng = random.Random(f"{seed}:{family}:{variant}")
    row = {
        "sample_id": f"{family}-{variant}", "group_id": f"{family}-group", "token_position": 0,
        "sampled_token_id": 0, "role": "policy", "loss_mask": True,
        "selected_logprob": {"kind": "known", "value": -math.log(3)},
        "support": {"kind": "captured", "token_ids": [0, 1, 2]},
        "raw_logits": {"kind": "known", "values": [rng.uniform(-2, 2) for _ in range(3)]},
        "processors": [],
    }
    source = {
        "format": "avalon.sampling/v1", "producer": {"name": "avalon-synthetic", "version": "1", "revision": "sampling-census-v1"},
        "context_hash": hashlib.sha256(f"{seed}:{family}:{variant}".encode()).hexdigest(), "samples": [row],
    }
    if family in ("support-permutation", "harmless-processors"):
        row["raw_logits"]["values"] = [0.0, 0.0, 0.0]
    if family == "support-permutation":
        row["support"]["token_ids"] = [0, 1]
    if family == "hidden-distribution":
        row["raw_logits"]["values"] = [0.0, math.log(2), 0.0]
    if family in ("processor-omission", "harmless-processors"):
        row["processors"] = [{"name": "temperature", "value": 2.0, "token_ids": []}]
    if family == "processor-order":
        row["processors"] = [{"name": "temperature", "value": 2.0, "token_ids": []}, {"name": "logit_bias", "value": 1.0, "token_ids": [0]}]
    row["selected_logprob"]["value"] = _dense_reference(parse_sampling_receipt(source).samples[0])[0]
    target = deepcopy(source)
    changed = target["samples"][0]
    if family == "support-permutation":
        changed["support"]["token_ids"] = [0, 2]
    elif family == "hidden-distribution":
        changed["raw_logits"]["values"] = [0.0, 0.0, math.log(2)]
    elif family in ("processor-omission", "harmless-processors"):
        changed["processors"] = []
    elif family == "processor-order":
        changed["processors"].reverse()
    elif family == "mask-flip":
        changed["loss_mask"] = False
    elif family == "active-tool":
        changed["role"] = "tool"
    elif family == "position-shift":
        changed["token_position"] = 1
    elif family == "group-shift":
        changed["group_id"] = "different-group"
    elif family == "common-offset":
        changed["raw_logits"]["values"] = [value + 1000.0 for value in changed["raw_logits"]["values"]]
    elif family == "support-order":
        changed["support"]["token_ids"].reverse()
    if family in ("processor-omission", "processor-order", "common-offset"):
        changed["selected_logprob"]["value"] = _dense_reference(parse_sampling_receipt(target).samples[0])[0]
    if family == "recorded-probability":
        row["selected_logprob"]["value"] = changed["selected_logprob"]["value"] = -0.123
    if family.startswith("unavailable-"):
        field = {"unavailable-support": "support", "unavailable-probability": "selected_logprob", "unavailable-logits": "raw_logits"}[family]
        changed[field] = {"kind": "unavailable", "reason": "The synthetic producer omits this evidence."}
    if family == "unsupported-processor":
        for item in (row, changed):
            item["processors"] = [{"name": "custom-unexecuted", "value": 1.0, "token_ids": []}]
    if family in ("nonpolicy", "inactive"):
        for item in (row, changed):
            item["role"] = "tool" if family == "nonpolicy" else "policy"
            item["loss_mask"] = False
            for field in ("support", "selected_logprob", "raw_logits"):
                item[field] = {"kind": "unavailable", "reason": "This token does not enter the update."}
    return source, target


def _hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def run_sampling_benchmark(*, seed: int = 7) -> dict[str, Json]:
    """Evaluate designated synthetic families without a model or a trainer."""
    if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("Use a uint32 benchmark seed.")
    started_tracing = not tracemalloc.is_tracing()
    if started_tracing:
        tracemalloc.start()
    methods = ("selected-logprob", "complete-support", "dense-categorical-assertion", "avalon")
    durations = {method: [] for method in methods}
    cases = []
    try:
        for family, partition, expected in FAMILIES:
            for variant in range(VARIANTS_PER_FAMILY):
                source_value, target_value = _case(seed=seed, family=family, variant=variant)
                source, target = parse_sampling_receipt(source_value), parse_sampling_receipt(target_value)
                results = {}
                for method in methods:
                    started = time.perf_counter_ns()
                    results[method] = audit_sampling_receipts(source=source, target=target).status if method == "avalon" else _baseline(source=source, target=target, method=method)
                    durations[method].append((time.perf_counter_ns() - started) / 1_000_000)
                cases.append({
                    "case_id": f"{family}-{variant}", "family": family, "partition": partition, "expected": expected,
                    "source_sha256": _hash(source_value), "target_sha256": _hash(target_value), "results": results,
                })
        peak_bytes = tracemalloc.get_traced_memory()[1] if started_tracing else None
    finally:
        if started_tracing:
            tracemalloc.stop()
    summaries = {}
    for method in methods:
        sample = sorted(durations[method])
        summaries[method] = {
            "cases": len(cases),
            "matching_expected_status": sum(case["results"][method] == case["expected"] for case in cases),
            "true_positives": sum(case["expected"] == "fail" and case["results"][method] == "fail" for case in cases),
            "false_positives": sum(case["expected"] == "pass" and case["results"][method] == "fail" for case in cases),
            "unknowns": sum(case["results"][method] == "inconclusive" for case in cases),
            "latency_ms": {"n": len(sample), "p50": statistics.median(sample), "p95": sample[math.ceil(len(sample) * 0.95) - 1], "min": sample[0], "max": sample[-1]},
            "api_cost_usd": 0.0,
        }
    return {
        "format": "avalon.sampling-benchmark/v1", "seed": seed, "case_count": len(cases),
        "fixture_snapshot_sha256": _hash([{key: value for key, value in case.items() if key != "results"} for case in cases]),
        "implementation_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "versions": {"python": sys.version.split()[0], "avalon_rl_lab": version("avalon-rl-lab")},
        "hardware": {"architecture": platform.machine(), "system": platform.system()},
        "python_peak_allocation_bytes": peak_bytes,
        "memory_scope": "The whole benchmark uses tracemalloc. Existing tracing yields no attributed memory measurement.",
        "expected_counts": {status: sum(case["expected"] == status for case in cases) for status in ("pass", "fail", "inconclusive")},
        "methods": summaries, "cases": cases,
        "limits": [
            "All cases are synthetic and authored with this implementation. Reserved families are not an independent blind evaluation.",
            "Each latency sample is one method call per case with allocation tracing enabled. No repeated-run interval is estimated.",
            "The fixture census does not estimate production error rates or policy improvement.",
            "The dense categorical assertion is the strongest simple baseline. Detection parity is not an Avalon advantage.",
            "No model, trainer, GPU, or external API executes. Local electricity cost is not measured.",
        ],
    }
