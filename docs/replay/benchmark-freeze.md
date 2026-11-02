# Freeze a benchmark and compare repairs

A freeze preserves the project, world, grader, policy, cases, assumptions, and baseline evidence.
It binds both containers to one resolved Docker image identity.
The current process does not need to fail before you can freeze it.
The reference and controls must validate the grader. Every baseline episode must complete.
The reference and positive controls must pass in each split.
Each negative control must produce a completed failure in both development and holdout splits.

Use `freeze_benchmark(project, image=..., timeout_seconds=5)` in the Python API.
A valid receipt has status `frozen`. An incomplete execution produces `inconclusive` and cannot support comparison.
The reason is `runtime-unavailable` when Docker or its image cannot start.
The reason is `baseline-incomplete-or-invalid` when execution or grader validation does not complete successfully.
Inspect the receipt before retrying with a new output path. A verified freeze records reason `verified`.
Use `validate_benchmark(receipt)` to check a receipt without starting Docker.
Use `compare_benchmark(receipt, candidates)` to evaluate candidates on the frozen holdout episodes.
Use `split="development"` during development. This mode executes development episodes only.
Use `split="all"` only when you explicitly need both splits.

The comparison uses the cached current-process baseline and the same paired seeds.
It retains failed and incomplete candidates in the sample count.
A return delta requires a completed candidate episode.
The report records the number of complete pairs beside the mean delta.
Arithmetic overflow produces a null delta or mean with an explicit reason.
The report separates completed pairs from successfully computed deltas.
It does not estimate statistical uncertainty or claim a population improvement.
An accepted candidate passes the goal checks. It can still perform below the cached baseline.
The separate relative outcome reports higher, lower, or equal mean return with absolute tolerance `1e-9`.
The relative outcome remains inconclusive when a pair is incomplete or arithmetic overflows.
Stochastic policies can vary between runs. Cached outcomes do not establish expected policy returns.

## Stored evidence

The receipt contains the complete serialized project and its hashes.
It includes the requested image, resolved image identity, timeout, and baseline report.
The UTC freeze timestamp records when the receipt is created.
An evaluator hash binds the benchmark, episode evaluator, actor, runner, and world adapter source files.
Validation rejects receipts when those files change. Regenerate the benchmark after an evaluator change.
Baseline rows preserve seeds, returns, verdicts, step counts, ending flags, cleanup evidence, versions, and measured duration.
Each trajectory becomes a SHA256 hash and a step count.
The initial observation becomes a hash when present.
The receipt also records the original full report hash.
These hashes cannot reconstruct discarded transitions or the original report.
The compact receipt must fit within 10 MiB.
Comparison reports contain the newly executed full traces.

The integrity hash covers the complete receipt except the integrity hash itself.
Validation also checks project hashes, image identity, baseline provenance, control results, and return verdicts.
These are local consistency checks. They are not signatures or authenticated execution attestations.
A person with write access can fabricate evidence and calculate new hashes.
Keep receipts under your normal access controls and version history.

## Limits

The project contains assumptions authored by a person or an agent.
A frozen world does not prove that its simulation matches the real workflow.
The local receipt exposes holdout seeds and baseline outcomes.
Development mode does not provide secure holdout isolation.
The comparison does not train a model or establish general usefulness across other tasks.
Read the measured durations beside return deltas. Compute and candidate generation costs remain unpriced.
The controls must test plausible failures and legitimate alternatives for the intended workflow.
