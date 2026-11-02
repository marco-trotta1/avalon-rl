# Replay captured failures

The replay evaluates recorded file contents against the case checks.
It does not run a program, model, shell command, or training process.

Use `replayFailureCase(case)` from the SDK.
A reproducible case requires a failing observed snapshot and a passing reference snapshot.
All other results have the `unresolved` status.
The report retains both evaluations and the case hash.

Each `equals` check compares the complete file text with the expected text.
Each `unchanged` check compares the complete file text with the initial text.
A missing file fails its check.
These checks do not detect temporary changes or effects outside the recorded files.
An exact text check can reject a valid alternative implementation.
Review the checks before you interpret their results.

## Compare a proposed repair

Call `compareFailureCases({ cases, candidates, split })`.
Each candidate has an `id` and a `files` snapshot.
Use `parseFailureCandidates(value)` to parse unknown candidate records.
Supply exactly one candidate for each case ID.

The baseline is the recorded observed snapshot.
The report retains the checks, case hashes, candidate hashes, and unresolved cases.
Each candidate hash binds the complete graded file snapshot.
The summary counts improved, regressed, and unchanged case outcomes.
The `bySplit` summaries separate development, holdout, and unsplit counts.
A case improves when its baseline fails and its candidate passes.
A case regresses when its baseline passes and its candidate fails.

The optional split has `developmentFamilyIds` and `holdoutFamilyIds` arrays.
Assign every family exactly once across the two arrays.
Both arrays must contain a family.
All variants from one family receive the same split.
The report includes a task hash for the initial files and the checks sorted by path.
Identical task hashes cannot cross the development and holdout splits.
Metadata labels and recorded outputs do not change this task hash.
The hash detects exact task copies. It does not detect all related variants.
Review family assignments for shared sources and similar tasks.
Without a split, every row has the `unsplit` label.
The split records assignment. It cannot prove that a developer never inspected holdout cases.

## Evidence limits

The counts describe the supplied cases only.
They do not establish population accuracy, model improvement, or training value.
The comparison does not measure model cost or model latency.
Record those measurements when you generate candidate outputs.
Preserve the model version, seed, data snapshot, and generation settings with that experiment.
Use an independently reviewed check and a simple baseline before you claim a method advantage.
