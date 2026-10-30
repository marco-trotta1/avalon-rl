# Sampling forensics

Avalon reads inert sampling receipts from local JSON files.
It does not import a trainer or execute a model.
The format is `avalon.sampling/v1`.

A receipt contains the producer name, version, revision, context SHA-256 hash, and token rows.
Each row identifies the sample, group, position, sampled token, observed role, and observed loss mask.
The role is `policy`, `tool`, `context`, or `padding`.
The key is the sample ID and token position.
One sample belongs to one group within a receipt.

The selected log probability uses `{"kind":"known","value":-0.5}`.
The support uses `{"kind":"captured","token_ids":[0,1]}`.
The raw logits use `{"kind":"known","values":[0,0,0]}`.
Unavailable evidence uses `{"kind":"unavailable","reason":"The producer does not export this evidence."}`.
The ordered processor list contains `name`, `value`, and `token_ids` for each step.
An empty processor list declares that no processor runs.

The parser rejects duplicate fields, duplicate token keys, duplicate support IDs, non-finite values, and integers that lose JSON precision.
The file reader accepts regular files of at most 4 MiB.
It rejects symbolic links and named pipes.
The limits are 4096 token rows, 4096 vocabulary entries per row, and 131072 total logit values.

Receipts can contain sensitive model evidence.
Keep user receipts outside Git.
The public examples contain synthetic data only.
Hashes bind supplied content. They do not prove that a trainer executes the recorded steps.

## Compare supports

Call `audit_sampling_receipts(source=source, target=target)` with parsed receipts.
The audit joins token rows by their sample ID and position.
It checks context, coverage, sampled identity, group, complete support, membership, and selected log probability.
Support order has no meaning.
The default absolute probability and log-probability tolerance is `1e-9`.
This tolerance covers arithmetic rounding in synthetic examples. It is not a measured cross-engine tolerance.
Select a measured tolerance for a real workflow.

The audit returns `pass`, `fail`, or `inconclusive`.
Each check returns `match`, `mismatch`, or `unknown`.
A known mismatch determines failure even when another check lacks evidence.
Unavailable support cannot establish a match.

The source example uses support `{0,1}` with three zero logits.
Change the target support to `{0,2}` and keep token `0` as the sample.
The selected log probabilities still agree at `-log(2)`.
The support audit identifies the difference.
This is a synthetic counterexample. It is not an upstream defect.
An exact assertion over the complete supports identifies the same difference.

## Replay a finite distribution

The reference normalizes the raw logits over the complete captured support.
It subtracts the maximum supported logit before it calculates the partition.
It compares each recorded selected probability with that reference.
Two receipts can agree with each other while both contradict their recorded logits.

A missing support, missing logits, unsupported processor, or unrepresentable result produces an unknown replay.
The reference does not reconstruct omitted vocabulary values.
The reference uses Python float64 arithmetic. It does not reproduce a GPU kernel.

## Declare the logit transformations

The reference supports `temperature`, `repetition_penalty`, `presence_penalty`, and `logit_bias`.
Temperature divides every logit by its positive value.
The repetition penalty divides nonnegative selected logits and multiplies negative selected logits by its positive value.
The presence penalty subtracts its value from the listed token logits.
The logit bias adds its value to the listed token logits.
The token list records affected IDs. It does not infer prompt or completion history.
The reference applies the list in the recorded order, then normalizes over the captured support.

Record the effective settings after configuration overrides.
A changed declaration produces an informational diagnostic.
When both distributions can be replayed, the audit compares their complete vocabulary probabilities.
Different declarations with equal effective distributions do not establish an update mismatch.
An unsupported processor produces unknown, even when both receipts name the same processor.
Avalon does not import a named processor or reconstruct a top-p filter.
The captured support records filtering evidence separately.
This reference does not establish a current TRL or vLLM defect.

## Preserve the training mask

The audit compares the observed role and loss mask at each token key.
Tool, context, and padding tokens must have a false loss mask.
A policy token can have a false loss mask under a declared masking rule.
Its captured sampling evidence remains subject to preservation checks.
Missing probability evidence for an inactive token does not make an update check inconclusive.

The audit does not require invented probabilities for nonpolicy tokens.
It still checks their coverage, identity, group, role, and loss mask.
Agreement between two invalid nonpolicy masks does not establish a pass.
The supplied role remains evidence from the producer. Avalon does not independently classify the token's origin.

## Describe correction impact

Call `sampling_correction_impact(source=source, target=target)` for raw token and sequence importance weights.
The log ratio is the target selected log probability minus the source selected log probability.
The sequence log ratio sums the aligned active policy tokens.
Inactive tokens do not enter that sum.
Mismatched identity, group, role, mask, or missing active probability produces unknown.

The result preserves a finite log ratio when its exponential underflows or overflows.
An unavailable probability never becomes a verified ratio of one.
These raw weights do not reproduce trainer clipping, optimizer behavior, or policy quality.
The audit also checks the complete replayed distribution when captured.
Equal support and equal selected probability can still hide different nonselected probabilities and gradients.

## Preserve a gradient witness

Call `sampling_gradient_witness(source=source, target=target, key=(sample_id, token_position))`.
The witness binds the context, selected token, group alignment, and complete receipt fingerprints.
It records both supports and the gradient of the selected log probability with respect to the processed categorical logits.
That gradient is the selected one-hot vector minus the replayed probability vector.

The source and target examples have equal selected probability and a gradient L1 difference of `1.0`.
This result uses one deterministic synthetic token and float64 arithmetic with an absolute tolerance of `1e-12`.
An exact complete-distribution assertion identifies the same difference.
The witness does not compute model parameter gradients, processor derivatives, an optimizer step, or policy improvement.
Unavailable evidence, inactive tokens, and mismatched token identities cannot produce a witness.
Keep the witness private because it contains raw model evidence.
