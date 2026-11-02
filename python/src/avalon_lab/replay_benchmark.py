"""Freeze a reviewed local benchmark and compare paired policy outcomes."""

from collections.abc import Mapping
from datetime import datetime, timezone
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Literal

from .replay_episode_contract import episode_task_hash
from .replay_episodes import run_episode_campaign
from .replay_project_contract import Project, benchmark_hash, parse_project, project_hash, project_to_dict
from .replay_runner import _docker_endpoint, _image_id
from .replay_script_world import ScriptWorldAdapter

FORMAT = "avalon.replay-benchmark.v1"
MAX_RECEIPT_BYTES = 10_485_760
RECEIPT_KEYS = {"format", "status", "reason", "project", "project_hash", "benchmark_hash", "baseline_report",
                "baseline_report_hash", "image_id", "image_requested", "timeout_seconds", "limits", "integrity_hash",
                "evaluator_hash", "frozen_at"}


def _bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def _hash(value: object) -> str:
    return hashlib.sha256(_bytes(value)).hexdigest()


def _digest(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _evaluator_hash() -> str:
    names = ("replay_benchmark.py", "replay_episodes.py", "replay_script_world.py", "replay_actor.py", "replay_runner.py")
    return _hash({name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in names})


def _campaign(project: Project, candidates, image_id: str, timeout_seconds: int, split: str) -> dict:
    def world_factory(_spec, *, max_steps):
        return ScriptWorldAdapter(project.world, image=image_id, max_steps=max_steps, timeout_seconds=timeout_seconds)
    return run_episode_campaign(project.task, candidates, image_id, timeout_seconds,
                                adapter_factory=world_factory, split=split, require_observed_failure=False)


def _compact(report: dict) -> dict:
    result = json.loads(_bytes(report))
    runs = [result["baseline"], result["reference"], *[item["run"] for item in result["controls"]],
            *[item["run"] for item in result["candidates"]]]
    for run in runs:
        for episode in run["episodes"]:
            trajectory = episode.pop("transitions")
            episode["trajectory_sha256"] = _hash(trajectory)
            episode["trajectory_steps"] = len(trajectory)
            if "initial_observation" in episode:
                episode["initial_observation_sha256"] = _hash(episode.pop("initial_observation"))
    result["trace_storage"] = "hashes-only"
    return result


def _validate_baseline(report: dict, project: Project, image_id: str) -> None:
    """Check recorded provenance and decisions without claiming authentication."""
    task = project.task
    task_digest = episode_task_hash(task)
    world = project_to_dict(project)["world"]
    if (report["format"] != "avalon.replay-episode-campaign.v1" or report["evaluated_split"] != "all"
            or report["task"]["hash"] != task_digest or report["image"]["resolved"] != image_id
            or report["grader"]["status"] != "accepted" or report["cleanup_blocked"] is not False
            or report["outstanding_containers"] or report["trace_storage"] != "hashes-only"):
        raise ValueError("The frozen baseline lacks complete accepted grader evidence.")
    if [item["id"] for item in report["controls"]] != [control.id for control in task.controls]:
        raise ValueError("The frozen controls do not match the project.")
    if len(report["candidates"]) != 1 or report["candidates"][0]["id"] != "current-process":
        raise ValueError("The frozen baseline must identify the current process.")
    runs = [(report["baseline"], task.snapshots.observed, None), (report["reference"], task.snapshots.reference, "pass"),
            (report["candidates"][0]["run"], task.snapshots.observed, None)]
    for control, recorded in zip(task.controls, report["controls"]):
        if recorded["expected"] != control.expect:
            raise ValueError("The frozen control expectation changes.")
        runs.append((recorded["run"], control.files, control.expect))
    for run, files, expected in runs:
        file_hash = _hash(dict(files))
        if run["candidate_hash"] != file_hash or len(run["episodes"]) != len(task.episodes):
            raise ValueError("The frozen baseline has incomplete policy evidence.")
        for row, episode in zip(run["episodes"], task.episodes):
            value = row["return"]
            if (row["id"] != episode.id or row["split"] != episode.split or type(row["seed"]) is not int or row["seed"] != episode.seed
                    or row["task_hash"] != task_digest or row["candidate_hash"] != file_hash or row["image_id"] != image_id
                    or row["environment"]["world_hash"] != _hash(world)
                    or row["environment"]["world_files_hash"] != _hash(dict(project.world.files))
                    or row["environment"]["image_id"] != image_id
                    or type(value) not in (int, float) or not math.isfinite(value)
                    or type(row["steps"]) is not int or not 1 <= row["steps"] <= task.max_steps
                    or row["trajectory_steps"] != row["steps"] or not _digest(row["trajectory_sha256"])
                    or type(row["terminated"]) is not bool or type(row["truncated"]) is not bool
                    or not (row["terminated"] or row["truncated"])
                    or row["actor"]["cleanup_blocked"] is not False):
                raise ValueError("The frozen episode does not match its source and execution contract.")
            status = "pass" if value + 1e-9 >= task.min_return else "fail"
            if row["status"] != status:
                raise ValueError("The frozen return does not support the recorded verdict.")
        status = "pass" if all(row["status"] == "pass" for row in run["episodes"]) else "fail"
        if run["status"] != status or (expected is not None and status != expected):
            raise ValueError("The frozen policy result contradicts its episode evidence.")
        if expected is not None:
            for split in ("development", "holdout"):
                rows = [row for row in run["episodes"] if row["split"] == split]
                split_status = "pass" if all(row["status"] == "pass" for row in rows) else "fail"
                if not rows or split_status != expected:
                    raise ValueError("The reference and controls must satisfy their expectations in each split.")
    candidate_status = "accepted" if report["candidates"][0]["run"]["status"] == "pass" else "rejected"
    if report["candidates"][0]["status"] != candidate_status or report["status"] != candidate_status or report["grader"]["reasons"]:
        raise ValueError("The frozen aggregate verdict contradicts its completed evidence.")


def freeze_benchmark(project: Project, *, image: str, timeout_seconds: int = 5) -> dict:
    """Capture an immutable comparison target without requiring baseline failure."""
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 60:
        raise ValueError("Use an integer timeout from one through 60 seconds.")
    if not isinstance(image, str) or not image.strip() or image.startswith("-") or len(image) > 300:
        raise ValueError("Supply a local Docker image name or digest.")
    project = parse_project(project_to_dict(project))
    image_id = report = full_report_hash = None
    status = "inconclusive"
    reason = "runtime-unavailable"
    try:
        image_id = _image_id(image, _docker_endpoint())
        reason = "baseline-incomplete-or-invalid"
        full_report = _campaign(project, {"current-process": project.task.snapshots.observed}, image_id, timeout_seconds, "all")
        full_report_hash = _hash(full_report)
        report = _compact(full_report)
        _validate_baseline(report, project, image_id)
        status = "frozen"
        reason = "verified"
    except (RuntimeError, OSError, ValueError, KeyError, TypeError):
        pass
    receipt = {
        "format": FORMAT, "status": status, "reason": reason, "project": project_to_dict(project), "project_hash": project_hash(project),
        "benchmark_hash": benchmark_hash(project), "baseline_report": report, "baseline_report_hash": full_report_hash,
        "image_id": image_id, "image_requested": image, "timeout_seconds": timeout_seconds,
        "evaluator_hash": _evaluator_hash(), "frozen_at": datetime.now(timezone.utc).isoformat(),
        "limits": [
            "Local hashes detect changed content. They are not signatures or authenticated execution attestations.",
            "The receipt stores trajectory hashes, not full transitions. The full report hash cannot reconstruct the original report.",
            "The current process can fail the threshold. Frozen status requires a valid grader and complete baseline execution.",
            "The project contains human or agent authored assumptions. A frozen simulation does not establish real-world fidelity.",
            "The local receipt exposes holdout seeds and baseline outcomes. It does not provide secure holdout isolation.",
            "No training occurs. Compute and candidate generation costs remain unpriced.",
        ],
    }
    receipt["integrity_hash"] = _hash(receipt)
    if len(_bytes(receipt)) > MAX_RECEIPT_BYTES:
        raise ValueError("Keep the compact benchmark receipt within 10 MiB.")
    return receipt


def _read_receipt(value: object) -> tuple[dict, Project]:
    try:
        if not isinstance(value, dict) or set(value) != RECEIPT_KEYS or len(_bytes(value)) > MAX_RECEIPT_BYTES:
            raise ValueError("Use the complete bounded benchmark receipt.")
        receipt = json.loads(_bytes(value))
        if receipt["format"] != FORMAT or receipt["status"] != "frozen" or receipt["reason"] != "verified":
            raise ValueError("Compare only a frozen benchmark.")
        if receipt["integrity_hash"] != _hash({key: item for key, item in receipt.items() if key != "integrity_hash"}):
            raise ValueError("The benchmark receipt has changed.")
        if receipt["evaluator_hash"] != _evaluator_hash():
            raise ValueError("The evaluator source has changed; regenerate the benchmark.")
        if not isinstance(receipt["frozen_at"], str):
            raise ValueError("Record the UTC freeze timestamp.")
        frozen_at = datetime.fromisoformat(receipt["frozen_at"])
        if frozen_at.tzinfo is None or frozen_at.utcoffset().total_seconds() != 0:
            raise ValueError("Record the UTC freeze timestamp.")
        project = parse_project(receipt["project"])
        if receipt["project_hash"] != project_hash(project) or receipt["benchmark_hash"] != benchmark_hash(project):
            raise ValueError("The frozen project hashes do not match.")
        if not isinstance(receipt["image_id"], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", receipt["image_id"]):
            raise ValueError("Use the pinned Docker image identity.")
        if not isinstance(receipt["image_requested"], str) or not receipt["image_requested"].strip() or receipt["image_requested"].startswith("-") or len(receipt["image_requested"]) > 300:
            raise ValueError("Record the requested Docker image.")
        if type(receipt["timeout_seconds"]) is not int or not 1 <= receipt["timeout_seconds"] <= 60:
            raise ValueError("Use the recorded bounded timeout.")
        if not _digest(receipt["baseline_report_hash"]) or not isinstance(receipt["limits"], list) or not all(isinstance(item, str) for item in receipt["limits"]):
            raise ValueError("Use the complete benchmark metadata.")
        _validate_baseline(receipt["baseline_report"], project, receipt["image_id"])
        return receipt, project
    except (KeyError, TypeError, OverflowError, UnicodeError, RecursionError) as error:
        raise ValueError("The benchmark receipt has invalid evidence.") from error


def validate_benchmark(receipt: object) -> dict:
    """Return a validated independent receipt without starting a runtime."""
    frozen, _ = _read_receipt(receipt)
    return frozen


def compare_benchmark(receipt: object, candidates: Mapping[str, Mapping[str, str]], *,
                      split: Literal["all", "development", "holdout"] = "holdout") -> dict:
    """Compare candidates with the cached current process on paired seeds."""
    if split not in ("all", "development", "holdout"):
        raise ValueError("Select development, holdout, or all episodes.")
    frozen, project = _read_receipt(receipt)
    report = _campaign(project, candidates, frozen["image_id"], frozen["timeout_seconds"], split)
    baseline = frozen["baseline_report"]["candidates"][0]["run"]
    selected = [row for row in baseline["episodes"] if split == "all" or row["split"] == split]
    baseline_by_id = {row["id"]: row for row in selected}
    comparisons = []
    for candidate in report["candidates"]:
        pairs = []
        for row in candidate["run"]["episodes"]:
            original = baseline_by_id[row["id"]]
            complete = row["status"] in ("pass", "fail") and type(row["return"]) in (int, float) and math.isfinite(row["return"])
            delta = row["return"] - original["return"] if complete else None
            delta_reason = "computed" if complete else "incomplete-candidate"
            if delta is not None and not math.isfinite(delta):
                delta = None
                delta_reason = "arithmetic-overflow"
            pairs.append({"id": row["id"], "split": row["split"], "seed": row["seed"],
                          "baseline_status": original["status"], "candidate_status": row["status"],
                          "baseline_return": original["return"], "candidate_return": row["return"],
                          "return_delta": delta, "delta_reason": delta_reason})
        deltas = [row["return_delta"] for row in pairs if row["return_delta"] is not None]
        mean = None
        mean_reason = "no-computed-pairs"
        if deltas:
            try:
                mean = math.fsum(deltas) / len(deltas)
                if not math.isfinite(mean):
                    raise OverflowError
                mean_reason = "computed"
            except OverflowError:
                mean = None
                mean_reason = "arithmetic-overflow"
        relative = "inconclusive"
        if pairs and len(deltas) == len(pairs) and mean is not None:
            relative = "higher-return" if mean > 1e-9 else "lower-return" if mean < -1e-9 else "equal-return"
        comparisons.append({"id": candidate["id"], "status": candidate["status"], "pairs": pairs,
                            "relative_outcome": relative, "relative_absolute_tolerance": 1e-9,
                            "sample_count": len(pairs), "complete_pairs": sum(row["candidate_status"] in ("pass", "fail") for row in pairs),
                            "computed_deltas": len(deltas), "mean_return_delta": mean, "mean_reason": mean_reason,
                            "uncertainty": "not estimated"})
    return {"format": "avalon.replay-benchmark-comparison.v1", "status": report["status"], "split": split,
            "project_hash": frozen["project_hash"], "benchmark_hash": frozen["benchmark_hash"],
            "receipt_integrity_hash": frozen["integrity_hash"], "baseline": {"candidate_hash": baseline["candidate_hash"], "episodes": selected},
            "candidate_report": report, "paired_deltas": comparisons,
            "limits": ["The cached baseline remains unchanged. Candidate policies run against the frozen task and world.",
                       "Counts include incomplete candidates. Return deltas require completed paired episodes.",
                       "Accepted status means the goal checks pass. It does not mean the candidate improves on the baseline.",
                       "Relative outcomes compare the mean paired return with absolute tolerance 1e-9 and require all pairs to complete.",
                       "A stochastic policy can differ across repeated runs. Cached outcomes do not establish expected policy returns.",
                       "Development mode executes development episodes only. The receipt still exposes holdout baseline evidence.",
                       "One run per seed does not establish a population gain, statistical confidence, or actual training.",
                       "Hashes provide local integrity checks, not authenticated execution or contributor identity."]}
