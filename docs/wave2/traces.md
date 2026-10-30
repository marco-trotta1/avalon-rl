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
