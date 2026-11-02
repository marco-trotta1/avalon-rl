# Candidate selection and runtime

Use this reference for `/rl-swarm`, `/rl-sweep`, and `/rl-status`.
Read the workflow protocol as a reference. Do not perform its context or Node setup steps before reading this procedure.
This procedure replaces that protocol's Node setup and runtime selection for these three workflows.
Its Python setup provides the training, evaluation, and sweep commands.

## Select the runtime

1. Prefer `PROJECT/.avalon/runtime/0.8.0/dist/cli.js`. Check `PROJECT/.avalon/runtime/0.8.0/package.json` as `avalon-rl` version `0.8.0`.
2. Run its `agent commands --json`. Require `rl-swarm`, `rl-sweep`, and `rl-status` in the catalog.
3. Use `node ABSOLUTE_ENTRYPOINT` in place of `avalon` throughout these workflows.
4. If the runtime is absent, follow the workflow protocol's pinned `v0.8.0` Node setup procedure.
5. An inspected local `0.8.0` archive or built source package is also supported.
6. Record its source revision, package version, and archive hash when an archive is used.
7. Verify the release manifest and checksum before executing a downloaded archive.
8. Check the returned entrypoint and catalog before starting a run.
9. If setup cannot complete, record the missing runtime and continue independent source inspection.

Do not silently substitute the older pinned bootstrap package for these workflows.
Existing `0.6.0` runtimes remain preserved during installation.
Reviewed stock protocols upgrade with retained backups. Customized skills remain protected.
All workflows prefer an installed `0.8.0` runtime. The original workflows can use the older runtime when the newer one is absent.
The pinned Python `0.4.0` wheel includes `gym-sweep`.
The existing `gym-train` and `gym-eval` commands also support a bounded sweep.

## Freeze the comparison

Freeze the candidate roster, baseline, metric direction, score bounds, sampling method, trial count, and error probability before collecting selection scores.
Freeze the required improvement margin against the baseline.
Bind each candidate to its source or checkpoint hash.
Use distinct construction, selection, and final evaluation data.
For site or time data, split by site and year rather than by row.
Specify how failures enter the score and denominator before execution.
Keep failed trials and candidates in the ledger.

Agent proposals and votes share context. They do not supply independent statistical trials.
Repeated steps within one episode do not become separate trials merely because they produce separate scores.
Use independent trials or a uniform sample without replacement from the declared evaluation population.
Declare the unit, such as an evaluation seed or a correctly formed group.
Disclose when the sampling assumption cannot be supported. Do not report a statistical winner in that case.

## Apply the fixed comparison

Inspect `avalon select --help` before preparing the plan and score files.
Use `avalon select --plan PLAN --scores SCORES --out NEW_REPORT` after all declared trials complete.
The selector uses a two-sided Hoeffding interval and a union bound across the frozen candidate count.
For a maximized metric, the selected candidate's lower bound must exceed every competing upper bound.
For a minimized metric, its upper bound must fall below every competing lower bound.
A candidate that replaces the baseline must also clear the frozen improvement margin.
Overlapping intervals produce an inconclusive result with exit code `5`.
Keep that result. Do not add trials after inspecting it under the same fixed comparison.
An adaptive or repeated comparison needs a separately justified error allocation.

Report the score bounds, sample unit, trial count, error probability, intervals, resource records, and sampling assumptions.
The confidence statement conditions on those assumptions and the supplied records.
It does not authenticate an evaluator, establish training gains, or certify a real-world outcome.
