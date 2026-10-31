# Artifact contract

The runtime stores its own profile, bindings, events, and final state.
The host writes the scientific and engineering artifacts below.
Use readable Markdown or validated structured data. Never fabricate an execution receipt.

## Result

Write a private `result.md` with these fields:

- Goal and completion rule.
- Source revision or source hashes, data identities, and relevant dependency versions.
- Inputs, assumptions, declared budget, and stopping rule.
- Executed commands, exit codes, failures, and output paths.
- Observed findings, tested hypotheses, and unresolved questions.
- Changed source files and the checks that cover them.
- Next valid action, if the process cannot finish.

Link supporting artifacts in the result.
Run `avalon agent record RUN_ID --kind evidence --message TEXT --artifact FILE --project PROJECT` for each substantive output.
Hashing the summary alone does not validate a trainer, grader, or experiment.
Attach the underlying outputs that support its claims.
Treat raw snapshots, witnesses, paths, logs, and checkpoints as private by default.

## Experiment

Freeze `experiment.md` before candidate selection or training.
Record the hypothesis, method, simple baseline, candidate variants, sample unit, seeds, data split, metrics, budget, and stopping rule.
Use group, site, family, or time splits when the domain requires them.
Separate training, development, and final evaluation.
Freeze the candidate before final evaluation. Record every exposure of the reserved data.
Do not tune the method with final evaluation results.

Retain every planned condition, stopped run, failure, tie, and negative result.
Report denominators and the actual sampling unit.
Cluster uncertainty by the independent unit, such as the training seed.
State the uncertainty method and its limits. Do not invent confidence from a single run.
Report latency, compute, external inference, and host-model cost separately.
Use unknown for unavailable costs. Zero external API use does not mean zero total cost.

## Handoffs

Each handoff names the producing run, artifact path, hash, evidence kind, and intended use.
Check bindings before consuming an artifact from a previous run.
Preserve distinctions among synthetic, user-supplied, and executed integration evidence.
Name the applicable environment, policy, task, grader, and split.
An agent's judgment requires a declared rubric and cannot silently replace independent outcome checks.

## Source changes

Keep the change within the requested task.
Update documentation with a behavior change.
Keep the failing test and counterexample with a repair.
Record intentional binding changes before obtaining fresh execution evidence.
Do not hide a failed control to make a candidate pass.
