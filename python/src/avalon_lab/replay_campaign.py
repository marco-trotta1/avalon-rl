"""Validate a behavioral grader and assess repairs on its supplied tests."""

from collections.abc import Mapping
import hashlib
from html import escape
import json
import platform
from time import perf_counter
from typing import Literal

from .replay_contract import ReplayTask, parse_files, parse_replay_task, task_hash, task_to_dict
from .replay_runner import run_snapshot

Decision = Literal["accepted", "rejected", "inconclusive"]


def _snapshot_hash(files: Mapping[str, str]) -> str:
    return hashlib.sha256(json.dumps(dict(files), sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _counts(run: dict, split: str) -> dict:
    tests = [test for test in run["test_results"] if test["split"] == split]
    return {"total": len(tests), "passed": sum(test["status"] == "pass" for test in tests),
            "failed": sum(test["status"] == "fail" for test in tests),
            "inconclusive": sum(test["status"] == "inconclusive" for test in tests)}


def _aggregate(decisions: list[Decision]) -> Decision:
    if "rejected" in decisions:
        return "rejected"
    if not decisions or "inconclusive" in decisions:
        return "inconclusive"
    return "accepted"


def run_campaign(task: ReplayTask, candidates: Mapping[str, Mapping[str, str]], image: str,
                 timeout_seconds: int = 5) -> dict:
    """Check controls and retain every execution before assessing repairs."""
    if not candidates or len(candidates) > 10:
        raise ValueError("Supply at least one candidate and at most 10 candidates.")
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 60:
        raise ValueError("Use an integer timeout from 1 through 60 seconds.")
    task = parse_replay_task(task_to_dict(task))
    frozen_candidates = {name: parse_files(dict(files)) for name, files in candidates.items()}
    if not all(isinstance(name, str) and name.strip() and len(name) <= 120 for name in frozen_candidates):
        raise ValueError("Use a nonempty candidate label of at most 120 characters.")
    frozen_task_hash = task_hash(task)
    pinned_image: str | None = None
    cleanup_blocked = False
    outstanding_containers: set[str] = set()
    started = perf_counter()

    def unexecuted(files: Mapping[str, str], reason: str, wall_ms: float) -> dict:
        return {
            "format": "avalon.replay-receipt.v1", "status": "inconclusive", "split": "all", "task_hash": frozen_task_hash,
            "candidate_hash": _snapshot_hash(files), "image_id": pinned_image, "protected_checks": [],
            "test_results": [{"id": test.id, "split": test.split, "status": "inconclusive", "reason": reason,
                              "wall_ms": None, "stdout_sha256": None, "container_name": None}
                             for test in task.tests],
            "wall_ms": wall_ms, "cleanup_blocked": cleanup_blocked,
            "limits": ["This snapshot does not execute. No behavioral outcome is available."],
        }

    def execute(files: Mapping[str, str]) -> dict:
        nonlocal pinned_image, cleanup_blocked
        if cleanup_blocked:
            return unexecuted(files, "prior-cleanup-unconfirmed", 0.0)
        run_started = perf_counter()
        try:
            result = run_snapshot(task, files, image=pinned_image or image, timeout_seconds=timeout_seconds)
        except (RuntimeError, OSError):
            result = unexecuted(files, "runner-startup-error", (perf_counter() - run_started) * 1000)
        if result.get("image_id") is not None:
            pinned_image = result["image_id"]
        unconfirmed = [test for test in result["test_results"] if test.get("reason") == "cleanup-unconfirmed"]
        if result.get("cleanup_blocked") or unconfirmed:
            cleanup_blocked = True
            outstanding_containers.update(test["container_name"] for test in unconfirmed if test.get("container_name"))
        return result

    baseline = execute(task.snapshots.observed)
    reference = execute(task.snapshots.reference)
    controls = [{"id": control.id, "expected": control.expect, "run": execute(control.files)}
                for control in task.controls]
    requirements = [("observed", "fail", baseline), ("reference", "pass", reference),
                    *[(control["id"], control["expected"], control["run"]) for control in controls]]
    decisions: list[Decision] = []
    reasons = []
    for label, expected, run in requirements:
        if run["status"] == "inconclusive":
            decisions.append("inconclusive")
            reasons.append(f"{label}: execution is inconclusive; the required result is {expected}.")
        elif run["status"] != expected:
            decisions.append("rejected")
            reasons.append(f"{label}: the result is {run['status']}; the required result is {expected}.")
        else:
            decisions.append("accepted")
    grader_status = _aggregate(decisions)
    assessed = []
    for name, files in frozen_candidates.items():
        run = execute(files)
        execution_status: Decision = {"pass": "accepted", "fail": "rejected", "inconclusive": "inconclusive"}[run["status"]]
        status = "inconclusive" if cleanup_blocked else _aggregate([grader_status, execution_status])
        development = _counts(run, "development")
        holdout = _counts(run, "holdout")
        assessed.append({"id": name, "status": status, "run": run, "development": development, "holdout": holdout,
                         "pass_count_change": {
                             split: _counts(run, split)["passed"] - _counts(baseline, split)["passed"]
                             for split in ("development", "holdout")},
                         "reason": "The decision requires an accepted grader and all supplied checks to pass."})
    return {
        "format": "avalon.replay-campaign.v1",
        "status": "inconclusive" if cleanup_blocked else _aggregate([grader_status, *[item["status"] for item in assessed]]),
        "cleanup_blocked": cleanup_blocked, "outstanding_containers": sorted(outstanding_containers),
        "task": {"id": task.id, "family_id": task.family_id, "title": task.title, "hash": frozen_task_hash},
        "image": {"requested": image, "resolved": pinned_image}, "python": platform.python_version(),
        "grader": {"status": grader_status, "reasons": reasons}, "baseline": baseline, "reference": reference,
        "baseline_counts": {split: _counts(baseline, split) for split in ("development", "holdout")},
        "controls": controls, "candidates": assessed,
        "measurement": {"wall_ms": (perf_counter() - started) * 1000, "samples_per_snapshot": 1,
                        "timing_uncertainty": "not estimated", "timeout_seconds": timeout_seconds,
                        "model_api_calls": 0, "model_api_cost_usd": 0, "compute_cost_usd": None,
                        "candidate_generation_cost_usd": None, "seed": None,
                        "seed_note": "The campaign uses supplied tests without random sampling."},
        "limits": [
            "Acceptance applies only to this task and its supplied tests. One task does not establish generalization.",
            "Holdout labels do not establish that the repair author lacked access to the tests.",
            "The campaign does not train a model or establish a model improvement.",
            "The candidate shares an interpreter with the harness. Candidate interference can invalidate its evidence.",
            "Runtime protected hashes are diagnostic evidence. They do not authenticate candidate behavior.",
            "Each launched snapshot runs once. Unconfirmed cleanup stops later launches; skipped rows remain inconclusive.",
            "Timing uncertainty is not estimated; compute and candidate generation costs remain unpriced.",
        ],
    }


def render_campaign_html(report: dict) -> str:
    """Render a standalone report with escaped text and no external assets."""
    def text(value: object) -> str:
        return escape(str(value), quote=True)

    def run_rows(rows: list[dict]) -> str:
        return "".join(
            "<tr><td>" + text(row["label"]) + "</td><td>" + text(row["expected"])
            + "</td><td>" + text(row["run"]["status"])
            + "</td><td>" + text(_counts(row["run"], "development")["passed"]) + " / " + text(_counts(row["run"], "development")["total"])
            + "</td><td>" + text(_counts(row["run"], "holdout")["passed"]) + " / " + text(_counts(row["run"], "holdout")["total"])
            + "</td><td>"
            + text(row["run"]["wall_ms"]) + "</td></tr>"
            for row in rows
        )

    evidence_rows = [
        {"label": "Observed failure", "expected": "fail", "run": report["baseline"]},
        {"label": "Reference repair", "expected": "pass", "run": report["reference"]},
        *[{"label": item["id"], "expected": item["expected"], "run": item["run"]} for item in report["controls"]],
    ]
    candidate_rows = "".join(
        "<tr><td>" + text(candidate["id"]) + "</td><td>" + text(candidate["status"])
        + "</td><td>" + text(candidate["development"]["passed"]) + " / " + text(candidate["development"]["total"])
        + "</td><td>" + text(candidate["holdout"]["passed"]) + " / " + text(candidate["holdout"]["total"])
        + "</td><td>" + text(candidate["run"]["wall_ms"]) + "</td></tr>"
        for candidate in report["candidates"]
    )
    limits = "".join("<li>" + text(limit) + "</li>" for limit in report["limits"])
    reasons = "".join("<li>" + text(reason) + "</li>" for reason in report["grader"]["reasons"])
    cleanup_notice = ""
    if report.get("cleanup_blocked"):
        containers = ", ".join(report.get("outstanding_containers", [])) or "See the execution receipts."
        cleanup_notice = ("<section><h2>Container cleanup requires attention</h2>"
                          "<p>Later execution stops because container removal is unconfirmed.</p><p>Outstanding containers: <code>"
                          + text(containers) + "</code></p></section>")
    evidence = escape(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False), quote=True)
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Avalon Replay report</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6f3eb;color:#17243a;font:16px/1.6 system-ui,sans-serif}
header{background:#14213d;color:#fff;padding:3rem max(1.5rem,calc((100vw - 1050px)/2))}header p{color:#cbd5e1}
main{max-width:1100px;margin:auto;padding:1.5rem}h1{font-size:2.6rem;line-height:1.15;margin:.5rem 0}h2{margin-top:0}
section{background:#fffdf8;border:1px solid #d9d9cf;border-radius:12px;padding:1.5rem;margin:1.5rem 0}
.label{text-transform:uppercase;letter-spacing:.13em;font-size:.8rem}.status{display:inline-block;background:#293f63;padding:.4rem .9rem;border-radius:6px}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:.7rem;border-bottom:1px solid #e1e3e8}
th{font-size:.85rem;color:#455469}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef1f5;padding:1rem;font-size:.8rem}
code{overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}footer{color:#455469;font-size:.85rem}li{margin:.35rem 0}
</style></head><body><header><div class="label">Avalon Replay · Behavioral repair evidence</div>
<h1>""" + text(report["task"]["title"]) + "</h1><span class=\"status\">" + text(report["status"]) + "</span>" + """
<p>One frozen task. Explicit controls. Separate development and holdout results.</p></header><main>
""" + cleanup_notice + "<section><h2>Grader validation</h2><p>Decision: <strong>" + text(report["grader"]["status"]) + "</strong></p><ul>" + reasons + """</ul>
<div class="table-wrap"><table><thead><tr><th>Snapshot</th><th>Required</th><th>Observed</th><th>Development</th><th>Holdout</th><th>Wall time (ms)</th></tr></thead><tbody>
""" + run_rows(evidence_rows) + """</tbody></table></div></section>
<section><h2>Repair assessment</h2><p>Counts show passing tests divided by all supplied tests. Incomplete tests remain in the denominator.</p>
<div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Decision</th><th>Development</th><th>Holdout</th><th>Wall time (ms)</th></tr></thead><tbody>
""" + candidate_rows + """</tbody></table></div></section>
<section><h2>Evidence limits</h2><ul>""" + limits + """</ul>
<p>Model API cost: 0 USD. Local compute and candidate generation costs remain unpriced.</p></section>
<section><details><summary>Complete campaign evidence</summary><pre>""" + evidence + """</pre></details></section>
<footer>Keep this report private. Acceptance applies only to the supplied task and tests.</footer>
</main></body></html>
"""
