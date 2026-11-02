"""Evaluate isolated policies against rewards computed by a trusted host world."""

from collections.abc import Callable, Mapping
from html import escape
import hashlib
import json
import math
import platform
from time import perf_counter
from typing import Literal

from .replay_actor import ActorError, DockerPolicySession
from .replay_adapters import create_adapter
from .replay_contract import parse_files
from .replay_episode_contract import EpisodeTask, episode_task_hash, episode_task_to_dict, parse_episode_task

TRACE_BYTES = 1_048_576


def _copy(value):
    return json.loads(json.dumps(value, allow_nan=False, ensure_ascii=False))


def _hash(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _summary(run: dict, split: str) -> dict:
    rows = [row for row in run["episodes"] if row["split"] == split]
    return {"total": len(rows), "passed": sum(row["status"] == "pass" for row in rows),
            "failed": sum(row["status"] == "fail" for row in rows),
            "inconclusive": sum(row["status"] == "inconclusive" for row in rows),
            "returns": [{"id": row["id"], "seed": row["seed"], "return": row["return"], "status": row["status"]} for row in rows]}


def _decision(statuses: list[str]) -> str:
    if "rejected" in statuses:
        return "rejected"
    return "inconclusive" if not statuses or "inconclusive" in statuses else "accepted"


def run_episode_campaign(task: EpisodeTask, candidates: Mapping[str, Mapping[str, str]], image: str,
                         timeout_seconds: int = 5, *, adapter_factory: Callable = create_adapter,
                         actor_factory: Callable = DockerPolicySession,
                         split: Literal["all", "development", "holdout"] = "all",
                         require_observed_failure: bool = True) -> dict:
    """Run paired episodes without accepting rewards from the policy process."""
    if split not in ("all", "development", "holdout") or type(require_observed_failure) is not bool:
        raise ValueError("Select a supported split and a boolean baseline requirement.")
    if not candidates or len(candidates) > 10:
        raise ValueError("Supply between one and 10 candidates.")
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 60:
        raise ValueError("Use an integer timeout from one through 60 seconds.")
    if not all(isinstance(name, str) and name.strip() and len(name) <= 120 for name in candidates):
        raise ValueError("Use candidate labels with one through 120 characters.")
    task = parse_episode_task(episode_task_to_dict(task))
    frozen_candidates = {name: parse_files(dict(files)) for name, files in candidates.items()}
    builtin_execution = adapter_factory is create_adapter and actor_factory is DockerPolicySession
    task_digest = episode_task_hash(task)
    episodes = tuple(episode for episode in task.episodes if split == "all" or episode.split == split)
    pinned_image = None
    cleanup_blocked = False
    outstanding: set[str] = set()
    campaign_started = perf_counter()

    def evaluate(files: Mapping[str, str]) -> dict:
        nonlocal pinned_image, cleanup_blocked
        snapshot_hash = _hash(dict(files))
        rows = []
        for episode in episodes:
            started = perf_counter()
            row = {"id": episode.id, "split": episode.split, "seed": episode.seed,
                   "task_hash": task_digest, "candidate_hash": snapshot_hash, "image_id": pinned_image,
                   "status": "inconclusive", "reason": "prior-cleanup-unconfirmed" if cleanup_blocked else "not-started",
                   "return": None, "steps": 0, "terminated": False, "truncated": False,
                   "ending_source": None, "transitions": [], "environment": None, "actor": None, "wall_ms": 0.0}
            if cleanup_blocked:
                rows.append(row)
                continue
            adapter = actor = None
            try:
                adapter = adapter_factory(task.environment, max_steps=task.max_steps)
                row["environment"] = _copy(adapter.metadata())
                observation = _copy(adapter.reset(seed=episode.seed))
                actor = actor_factory(files=files, entrypoint_file=task.policy.file, function=task.policy.function,
                                      image=pinned_image or image, timeout_seconds=timeout_seconds, max_actions=task.max_steps)
                actor.start()
                pinned_image = actor.image_id
                row["image_id"] = pinned_image
                row["initial_observation"] = _copy(observation)
                total = 0.0
                trace_bytes = 0
                for index in range(task.max_steps):
                    action = _copy(actor.act(_copy(observation)))
                    transition = adapter.step(_copy(action))
                    if type(transition.reward) not in (int, float) or not math.isfinite(transition.reward):
                        raise ValueError("The trusted world must supply a finite reward.")
                    if type(transition.terminated) is not bool or type(transition.truncated) is not bool:
                        raise ValueError("The trusted world must supply boolean ending flags.")
                    next_observation = _copy(transition.observation)
                    total += transition.reward
                    if not math.isfinite(total):
                        raise ValueError("The episode return must remain finite.")
                    terminated = transition.terminated
                    truncated = transition.truncated or (index + 1 >= task.max_steps and not terminated)
                    source = "world" if transition.terminated or transition.truncated else "campaign-step-limit" if truncated else None
                    record = {"step": index, "observation": _copy(observation), "action": action,
                              "reward": float(transition.reward), "next_observation": next_observation,
                              "terminated": terminated, "truncated": truncated, "ending_source": source}
                    trace_bytes += len(json.dumps(record, allow_nan=False).encode())
                    if trace_bytes > TRACE_BYTES:
                        raise ActorError("trace-limit")
                    row["transitions"].append(record)
                    row.update(steps=index + 1, **{"return": total}, terminated=terminated, truncated=truncated, ending_source=source)
                    observation = next_observation
                    if terminated or truncated:
                        row["status"] = "pass" if total + 1e-9 >= task.min_return else "fail"
                        row["reason"] = "threshold-met" if row["status"] == "pass" else "below-threshold"
                        break
            except ActorError as error:
                row.update(status="inconclusive", reason=error.reason)
            except Exception as error:
                row.update(status="inconclusive", reason="world-or-policy-error")
                if getattr(error, "cleanup_blocked", False):
                    cleanup_blocked = True
                    row["reason"] = "world-cleanup-error"
                    name = getattr(error, "container_name", None)
                    if isinstance(name, str):
                        outstanding.add(name)
            finally:
                if actor is not None:
                    try:
                        receipt = actor.close()
                        row["actor"] = _copy(receipt)
                        if receipt.get("cleanup_blocked"):
                            cleanup_blocked = True
                            row.update(status="inconclusive", reason="cleanup-unconfirmed")
                            if receipt.get("container_name"):
                                outstanding.add(receipt["container_name"])
                    except Exception:
                        cleanup_blocked = True
                        row.update(status="inconclusive", reason="cleanup-unconfirmed")
                if adapter is not None:
                    try:
                        adapter.close()
                    except Exception as error:
                        cleanup_blocked = True
                        row.update(status="inconclusive", reason="world-cleanup-error")
                        name = getattr(error, "container_name", None)
                        if isinstance(name, str):
                            outstanding.add(name)
                row["wall_ms"] = (perf_counter() - started) * 1000
            rows.append(row)
        status = "inconclusive" if any(row["status"] == "inconclusive" for row in rows) else "fail" if any(row["status"] == "fail" for row in rows) else "pass"
        return {"status": status, "candidate_hash": snapshot_hash, "episodes": rows}

    baseline = evaluate(task.snapshots.observed)
    reference = evaluate(task.snapshots.reference)
    controls = [{"id": control.id, "expected": control.expect, "run": evaluate(control.files)} for control in task.controls]
    requirements = [("reference", "pass", reference),
                    *[(control["id"], control["expected"], control["run"]) for control in controls]]
    if require_observed_failure:
        requirements.insert(0, ("observed", "fail", baseline))
    grader_decisions = []
    reasons = []
    for label, expected, run in requirements:
        decision = "inconclusive" if run["status"] == "inconclusive" else "accepted" if run["status"] == expected else "rejected"
        grader_decisions.append(decision)
        if decision != "accepted":
            reasons.append(f"{label}: the result is {run['status']}; the required result is {expected}.")
    grader_status = _decision(grader_decisions)
    assessed = []
    for name, files in frozen_candidates.items():
        run = evaluate(files)
        outcome = {"pass": "accepted", "fail": "rejected", "inconclusive": "inconclusive"}[run["status"]]
        assessed.append({"id": name, "status": "inconclusive" if cleanup_blocked else _decision([grader_status, outcome]),
                         "run": run, "development": _summary(run, "development"), "holdout": _summary(run, "holdout")})
    return {
        "format": "avalon.replay-episode-campaign.v1", "evaluated_split": split, "task": {"id": task.id, "title": task.title, "hash": task_digest},
        "status": "inconclusive" if cleanup_blocked else _decision([grader_status, *[row["status"] for row in assessed]]),
        "grader": {"status": grader_status, "reasons": reasons}, "baseline": baseline, "reference": reference,
        "controls": controls, "candidates": assessed, "image": {"requested": image, "resolved": pinned_image},
        "execution": {"actor": "docker" if actor_factory is DockerPolicySession else "trusted-custom",
                      "world": "builtin" if adapter_factory is create_adapter else "trusted-custom"},
        "cleanup_blocked": cleanup_blocked, "outstanding_containers": sorted(outstanding),
        "measurement": {"wall_ms": (perf_counter() - campaign_started) * 1000, "unit": "undiscounted episode return",
                        "baseline": "recorded-observed-policy", "samples_per_policy": len(episodes),
                        "seeds": [episode.seed for episode in episodes], "uncertainty": "not estimated",
                        "model_api_calls": 0 if builtin_execution else None,
                        "model_api_cost_usd": 0 if builtin_execution else None, "compute_cost_usd": None,
                        "candidate_generation_cost_usd": None, "python": platform.python_version(),
                        "action_timeout_seconds": timeout_seconds,
                        "actor_lifetime_seconds": 60 if actor_factory is DockerPolicySession else None,
                        "min_return": task.min_return, "return_absolute_tolerance": 1e-9, "max_steps": task.max_steps},
        "limits": [
            "The trusted world computes rewards and ending flags. The policy supplies actions only.",
            "Acceptance applies to the supplied paired seeds. It does not establish generalization or model improvement.",
            "The return threshold uses absolute tolerance 1e-9 for floating-point accumulation.",
            "Invalid actions, protocol errors, and timeouts remain inconclusive. They cannot satisfy negative controls.",
            "The step budget is a valid truncation. An infrastructure timeout is not a completed episode.",
            "Custom adapters run trusted code on the host. The manifest does not load code automatically.",
            "External calls and costs are unknown for custom factories. The report identifies custom execution backends.",
            "The default Docker actor has a 60-second lifetime budget. Endpoint and image checks occur before that budget.",
            "Custom actor factories run trusted code and may not provide process isolation or lifetime bounds.",
            "Traces retain at most 500 transitions and 1 MiB per episode. Trace overflow remains inconclusive.",
            "These seeds run once per policy. Uncertainty is not estimated; compute and candidate generation costs remain unpriced.",
        ],
    }


def render_episode_html(report: dict) -> str:
    """Render local episode evidence without external assets or active user markup."""
    def text(value) -> str:
        return escape(str(value), quote=True)
    snapshots = [("Observed baseline", report["baseline"]), ("Reference", report["reference"]),
                 *[("Control: " + control["id"], control["run"]) for control in report["controls"]],
                 *[("Candidate: " + candidate["id"], candidate["run"]) for candidate in report["candidates"]]]
    rows = "".join("<tr>" + "".join("<td>" + text(value) + "</td>" for value in
                                  (label, episode["id"], episode["split"], episode["seed"], episode["status"], episode["return"], episode["steps"], episode["terminated"], episode["truncated"])) + "</tr>"
                   for label, run in snapshots for episode in run["episodes"])
    details = escape(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False), quote=True)
    limits = "".join("<li>" + text(limit) + "</li>" for limit in report["limits"])
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Avalon episode report</title>
<style>body{margin:0;background:#f7f3ea;color:#182b47;font:16px/1.5 system-ui,sans-serif}header{background:#152742;color:#fff;padding:2rem}main{padding:2rem;max-width:1300px;margin:auto}section{background:#fffdf7;padding:1.5rem;margin-bottom:1.5rem;border:1px solid #d7dce4;border-radius:10px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:.85rem}td,th{padding:.6rem;border-bottom:1px solid #d7dce4}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}summary{cursor:pointer}</style>
</head><body><header><p>Avalon Replay · World-owned rewards</p><h1>""" + text(report["task"]["title"]) + "</h1><p>" + text(report["status"]) + """</p></header><main>
<section><h2>Paired episode evidence</h2><p>Each policy uses the same seeds. Incomplete episodes remain in the report.</p><div class="scroll"><table><thead><tr><th>Policy</th><th>Episode</th><th>Split</th><th>Seed</th><th>Status</th><th>Return</th><th>Steps</th><th>Terminated</th><th>Truncated</th></tr></thead><tbody>""" + rows + """</tbody></table></div></section><section><h2>Limits</h2><ul>""" + limits + """</ul></section><section><details><summary>Complete traces and receipts</summary><pre>""" + details + "</pre></details></section></main></body></html>"
