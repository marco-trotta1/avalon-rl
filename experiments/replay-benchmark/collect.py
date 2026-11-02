"""Record authored benchmark evidence with real isolated execution."""

import json
from pathlib import Path

from avalon_lab.replay_benchmark import freeze_benchmark, compare_benchmark
from avalon_lab.replay_project_demo import project_demo

project = project_demo()
receipt = freeze_benchmark(project, image="python:3.11.15-slim")
assert receipt["status"] == "frozen", receipt["reason"]
comparison = compare_benchmark(receipt, {"follow-request": project.task.snapshots.reference})
assert comparison["status"] == "accepted"
result = {
    "provenance": "authored-two-step-allocation-real-docker",
    "benchmark_hash": receipt["benchmark_hash"], "evaluator_hash": receipt["evaluator_hash"],
    "image_id": receipt["image_id"], "frozen_at": receipt["frozen_at"],
    "baseline_measurement": receipt["baseline_report"]["measurement"],
    "comparison_measurement": comparison["candidate_report"]["measurement"],
    "paired_deltas": comparison["paired_deltas"],
    "limits": ["The two possible target orders repeat across splits. This is a workflow test, not a generalization test.",
               "The policies are authored. No weights are trained and no production process is evaluated.",
               "Uncertainty is not estimated. Compute and candidate generation costs remain unpriced."]
}
Path("experiments/replay-benchmark/results.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
print(json.dumps({"status": comparison["status"], "paired_deltas": comparison["paired_deltas"]}, indent=2))
