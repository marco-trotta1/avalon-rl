# Trace contracts

A trace contract declares outcome rules for an experience snapshot.
The contract format is `avalon.trace-contract/v1`.
The snapshot uses the existing `avalon.snapshot/v1` format.
Neither input executes code.

Each contract has a name and unique rule identifiers.
The rule kinds are `final-equals`, `preserve`, and `action-allowlist`.
A path is an array of object keys and array indices.
An object key of `"0"` differs from array index `0`.
An empty path selects the complete value.
Missing evidence differs from an explicit JSON null.
The path resolver reads own properties only.

Numeric comparisons declare absolute and relative tolerances.
Both tolerances are finite and nonnegative.
Rules without tolerances use zero tolerance.
The contract states a supplied specification. It does not prove the specification correct.

## Outcome checks

`auditTraceContract({snapshot, contract})` returns `match`, `mismatch`, or `unknown`.
The `final-equals` rule compares the last next observation with a declared value.
The final `preserve` rule compares the first observation with the last next observation.
Missing paths return `unknown`.
Open episodes, missing transitions, inconsistent continuity, and duplicate episode identities also return `unknown`.
These cases do not establish a correct final outcome.
Reports retain hashes and rule identifiers. They omit raw observations, actions, and episode identifiers.
An episode with positive reward and a mismatch counts as a rewarded disagreement.
That count does not establish why the reward differs from the rule.
An absent episode or empty rule set returns `unknown`, including for typed SDK callers.

## History and authority

The `preserve` rule with `scope: "every-step"` checks every next observation against the initial value.
It detects a protected change even when a later action restores the final value.
The `action-allowlist` rule selects actions through its `when` path and value.
It compares the selected action field with the declared allowed values.
It does not trust an action's supplied authorization label.
An empty allowed list forbids every selected action.
Missing selected fields return `unknown` unless another action establishes a mismatch.
An episode without a selected action matches that scoped authority rule.
Use a separate goal rule when the task requires an action or outcome.

## Paired renaming

`parseTracePairContract` parses `avalon.trace-pair/v1`.
`auditTracePair({source, target, contract})` compares complete declared episode pairs.
Each pair binds the source and target episode identifiers and task identifiers.
The contract declares a one-to-one string renaming.
The transformation applies to observation, action, next-observation, and metadata keys and string values.
All other transition fields must stay equal, including reward and both ending signals.
The audit compares the complete transformed episode through the existing snapshot auditor.
Missing pairs, ambiguous identities, unpaired episodes, and renaming collisions return `unknown`.
Internally invalid or incomplete pair members also return `unknown`.
The audit does not treat a declared renaming as proof of a new task family.

## Private witnesses

`buildTraceWitness({snapshot, contract, finding})` selects a zero-based check index.
Without an index, it selects the first mismatch.
The selected check must be a mismatch with unambiguous episode evidence.
The witness retains one complete episode and one rule.
It binds the episode identity, rule, finding code, step, and evidence hashes.
`verifyTraceWitness({witness, sourceSnapshot, sourceContract})` checks that binding against the original supplied artifacts.
It also binds the complete retained episode, selected rule, and source envelopes.
Changing an unrelated action or contract name invalidates the witness, even when the selected finding stays equal.
Changing the selected episode identity invalidates the binding, even when the replacement fails the same rule.

The witness contains raw evidence. Keep the output private.
The reduction does not remove individual steps or claim a shortest counterexample.
The hashes do not authenticate the original recorder.

## Finite learning tables

`makeWorldMdp({task, horizon, split})` exports `avalon.mdp/v1` through the existing world reducer.
`makeWorldMdpSuite({seed, horizon, split})` exports all existing catalog tasks.
The default horizon is four actions. The accepted range is one to six actions.
The action alphabet contains exact payments, zero payments, ticket closure, a completion claim, and finish.
The exporter does not change the world or call its known solution during search.
It accepts unchanged catalog tasks only.
It rejects custom initial states before it applies the state grouping.

The table groups states with identical payments, ticket state, claim state, authority, prohibited-action count, horizon, and ending state.
Full event histories do not enter the key.
Those grouped histories have the same available actions, rewards, and successor groups in this declared world.
The tests check every action path to depth three for all four catalog tasks.
This finite check does not prove that the abstraction fits another world.

The policy uses `observationKey`, a JSON encoding of normalized public task features.
The declared task goal is public instruction and enters this key.
It includes remaining actions and prohibited-action history.
It excludes task identifiers, split labels, reward columns, and expected verdicts.
The separate observation retains actual invoice amounts for independent evaluation.
The table keeps the known solution outside policy observations as a ceiling control.

Rewards occur only on ending transitions.
The `claim` reward checks the completion claim.
The `final` reward checks the goal and protected final records.
The `history` reward uses the existing independent world verifier.
The terminal outcome remains separate from these reward columns.
The exported `valid` label comes from the existing world verifier.
That label is not independent ground truth.
The Python evaluator must recompute goal, frame, and history outcomes from the raw observations and concrete actions.
Training must read only training tables. Evaluation must freeze the policy before it opens evaluation tables.
The optional `split` declares the experiment partition in envelope metadata.
Without it, the exporter uses the catalog partition.
An override changes no task, state, action, reward, outcome, or policy feature.

## Holdout manifests

`parseTraceHoldout` parses `avalon.trace-holdout/v1`.
`auditTraceHoldout({manifest})` compares declared training and evaluation groups.
The manifest selects disjoint task families, mutation families, or instance groups.
The audit always checks supplied SHA-256 values for exact overlap.
Both partitions must contain evidence. A missing partition returns `unknown`.
Reports hash group labels instead of exposing them.
The audit checks declarations and supplied hashes, not the underlying files.
A manifest hash does not prove that the partition was frozen before evaluation.

## Finite control comparison

`runTraceBenchmark({seed, repetitions})` compares accept-all, weak-claim, simple-full-assertion, and Avalon trace contracts.
The suite contains 28 synthetic cases across four existing tasks.
It retains 12 valid plans, 12 invalid plans, and four missing-evidence views.
The valid plans include reordered independent work and an early completion claim followed by correct work.
The expected labels come from hand-authored mutations, not the tested verifier.
The simple assertion independently checks the same declared final records and payment authority.

The report records each verdict, exact counts, versions, hardware, artifact hash, latency samples, and API costs.
Timing repetitions do not increase the accuracy sample size.
Latency excludes fixture construction and includes clock overhead.
The RSS samples do not measure peak memory. Local compute costs remain unmeasured.
The finite suite does not estimate a production detection rate.
A tie with the simple assertion does not establish a detection advantage.

The executed seed-7 comparison gives these exact counts over 28 finite cases:

| Method | Correct cases | False accepts | False rejects | Unknown verdicts | p50 ms | p95 ms | API fees USD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accept all | 12 | 12 | 0 | 0 | 0.000083 | 0.000166 | 0 |
| Weak claim | 8 | 12 | 4 | 0 | 0.000166 | 0.000167 | 0 |
| Simple full assertion | 28 | 0 | 0 | 4 | 0.026958 | 0.078959 | 0 |
| Avalon trace contract | 28 | 0 | 0 | 4 | 0.061500 | 0.148750 | 0 |

Avalon and the simple full assertion return identical verdicts on all 28 cases.
These counts have no sampling uncertainty within the declared finite set.
They supply no population estimate or algorithmic novelty evidence.
The fixture hash is `9f53a70792de705902e10177c6320bca94ef685830da54447623bc8580672562`.
The run uses Node.js 22.22.3, Zod 4.6.7, and method version 1.
The hardware is an Apple M5 with Darwin 25.6.0 on arm64.
Latency uses 140 observations per method: five timing repetitions of 28 cases.
These local quantiles include clock overhead and have no estimated confidence interval.
The runner makes zero model calls. API fees are 0 USD for every compared method.

## Runnable artifacts

All files in `examples/traces` contain synthetic evidence.
`snapshot.json` retains an unauthorized payment and its restoration.
`contract.json` checks the final state and returns `match`.
`history-contract.json` adds payment authority and returns `mismatch` on the same snapshot.
`pair-contract.json` declares the transformation to `paired-snapshot.json`.
The paired audit returns `match` for that complete static transformation.
The transformed trace is not an executed run of a renamed environment.
`holdout.json` illustrates disjoint mutation and instance groups.
Its hashes bind the supplied synthetic snapshot objects.
