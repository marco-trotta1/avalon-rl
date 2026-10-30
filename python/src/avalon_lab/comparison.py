"""Explicit user-runner comparison against two simple baselines."""

import hashlib
import json
import math
from pathlib import Path
import platform
import subprocess
from time import perf_counter

from .faults import FAULTS
from .learner import learner_snapshot
from .snapshot import read_snapshot, write_json, write_snapshot


def structural_valid(snapshot: dict) -> bool:
    """A deliberately simple format baseline without preservation checks."""
    try:
        return snapshot["format"] == "avalon.snapshot/v1" and bool(snapshot["episodes"]) and all(
            bool(episode["steps"]) and all(
                type(step["reward"]) in (int, float) and math.isfinite(step["reward"])
                and type(step["terminated"]) is bool and type(step["truncated"]) is bool
                and all(key in step for key in ("index", "observation", "action", "next_observation"))
                for step in episode["steps"]
            ) for episode in snapshot["episodes"]
        )
    except (KeyError, TypeError):
        return False


def exact_preserved(source: dict, target: dict) -> bool:
    """Compare all episode content while permitting added learner masks."""
    normalized = json.loads(json.dumps(target["episodes"], allow_nan=False))
    for episode in normalized:
        for step in episode["steps"]:
            step.pop("bootstrap_mask", None)
    return source["episodes"] == normalized


def run_comparison(*, experiment: Path, avalon_cli: Path, output: Path) -> dict:
    cli = avalon_cli.resolve(strict=True)
    source_path = (experiment / "source.json").resolve(strict=True)
    source = read_snapshot(source_path)
    if source.evidence != "synthetic":
        raise ValueError("Use the synthetic experiment for the controlled comparison.")
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = []
    for case in ("clean", *FAULTS):
        recorded_path = experiment / ("recorded.json" if case == "clean" else f"fault-{case}.json")
        recorded = read_snapshot(recorded_path)
        learner = learner_snapshot(recorded)
        learner_path = output / f"{case}-learner.json"
        write_snapshot(learner_path, learner)
        for stage, target_path, target in (("recorded", recorded_path, recorded), ("learner", learner_path, learner)):
            measured = {}
            started = perf_counter()
            structural = structural_valid(target.to_dict())
            measured["structural_ms"] = (perf_counter() - started) * 1000
            started = perf_counter()
            exact = exact_preserved(source.to_dict(), target.to_dict())
            measured["exact_ms"] = (perf_counter() - started) * 1000
            report_path = output / f"{case}-{stage}-audit.json"
            command = ["node", str(cli), "audit", "--source", str(source_path), "--target", str(target_path.resolve()), "--out", str(report_path)]
            started = perf_counter()
            completed = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
            measured["avalon_process_ms"] = (perf_counter() - started) * 1000
            status = {0: "pass", 4: "fail", 5: "inconclusive"}.get(completed.returncode, "runner-error")
            if status == "runner-error":
                raise RuntimeError(f"The Avalon runner exits with code {completed.returncode}: {completed.stderr[:500]}")
            results.append({"case": case, "stage": stage, "expected_fault": case != "clean", "structural": "pass" if structural else "fail", "exact": "pass" if exact else "fail", "avalon": status, "avalon_exit_code": completed.returncode, "latency_ms": measured})
    report = {
        "format": "avalon.python-comparison/v1", "evidence": "synthetic", "seed": source.seed,
        "python": platform.python_version(), "avalon_cli": str(cli), "results": results,
        "experiment_manifest": json.loads((experiment / "manifest.json").read_bytes()),
        "baseline_implementation_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "avalon_modules_sha256": {str(path.relative_to(cli.parent)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(cli.parent.rglob("*.js"))},
        "input_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(experiment.glob("*.json"))},
        "node": subprocess.run(["node", "--version"], capture_output=True, text=True, check=True, timeout=10).stdout.strip(),
        "measurement": {"samples_per_case_stage": 1, "uncertainty": "not estimated", "unit": "ms", "avalon_latency_includes_node_startup": True},
        "api_calls": 0, "api_cost_usd": 0, "local_compute_cost": "not measured",
        "limits": ["Five selected injected faults do not estimate production detection rates.", "The exact assertion can detect the same controlled faults.", "No upstream defect is established."],
    }
    write_json(output / "comparison.json", report)
    return report
