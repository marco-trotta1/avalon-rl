# Frozen benchmark workflow evidence

This authored allocation task checks the project workflow with real Docker containers.
The world and policy run in separate containers. No customer process or trained model is evaluated.

The freeze captures four baseline cases with seeds 7, 8, 19, and 20.
The final comparison uses only holdout seeds 19 and 20.
The current policy receives one reward unit per case. The candidate receives two reward units per case.
The mean paired difference is one reward unit across two completed holdout pairs.
Uncertainty is not estimated. Both possible target orders also occur in development.
This result establishes execution and comparison behavior, not generalization.

The recorded freeze takes 17,009.6 ms across 20 policy episodes.
The holdout campaign takes 7,068.3 ms across ten policy episodes, including repeated controls and the reference.
These are single-run wall times. Host load, Docker caching, and startup affect these measurements.
API usage is uninstrumented for the generic adapter. Compute and candidate generation costs remain unpriced.
The [results](results.json) preserve the image identity, evaluator hash, seeds, Python version, outcomes, and durations.
The policy and world use the pinned Python 3.11.15 image. The host uses Python 3.13.5.

Reproduce from the repository root after installing the Python dependencies and starting Docker:

```sh
docker pull python:3.11.15-slim
PYTHONPATH=python/src python3 experiments/replay-benchmark/collect.py
```

The collector replaces `results.json` with the new measurements.
The CLI integration test separately verifies baseline reuse, development-only execution, and comparison after the original project changes.
The original benchmark bytes remain unchanged throughout that test.

Local verification passes 346 Node tests and 504 Python tests.
The normal Python run skips 13 Docker tests. The separate Docker run covers those tests.
The first world test attempt fails because its image is unavailable. Loading the documented image resolves that prerequisite.
Review finds a control that fails development but passes holdout, despite a valid freeze.
Regression tests reproduce that defect. Freeze now requires effective controls in both splits.
Other regression tests cover evaluator drift, altered receipts, non-finite differences, and the exact serialized file size.

The static HTML receives programmatic checks. Visual inspection remains unverified.
The project workflow does not add external service connectors or train model weights.
