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
Missing selected fields return `unknown` unless another action establishes a mismatch.
An episode without a selected action matches that scoped authority rule.
Use a separate goal rule when the task requires an action or outcome.

## Finite learning tables

`makeWorldMdp({task, horizon})` exports `avalon.mdp/v1` through the existing world reducer.
`makeWorldMdpSuite({seed, horizon})` exports all existing catalog tasks.
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
