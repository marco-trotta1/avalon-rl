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
It includes remaining actions and prohibited-action history.
It excludes task identifiers, split labels, reward columns, and expected verdicts.
The separate observation retains actual invoice amounts for independent evaluation.
The table keeps the known solution outside policy observations as a ceiling control.

Rewards occur only on ending transitions.
The `claim` reward checks the completion claim.
The `final` reward checks the goal and protected final records.
The `history` reward uses the existing independent world verifier.
The terminal outcome remains separate from these reward columns.
Training must read only training tables. Evaluation must freeze the policy before it opens evaluation tables.
