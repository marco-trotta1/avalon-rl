# Learned policies

The Python policy experiment consumes inert tables from the existing operations reducer.
It does not implement another world reducer.
The table format is `avalon.mdp/v1`.
The producer is `avalon-operations`, version `1`.

## Finite boundary

Call `read_mdp(Path(...))` or `parse_mdp(value)` from `avalon_lab.policy_mdp`.
The parser rejects missing actions, unreachable states, invalid ending signals, and inconsistent horizon or history fields.
It checks feature aliases against outgoing transitions and all three reward columns.
The feature key includes the remaining horizon and prohibited payment count.
The key excludes task identifiers, split names, expected verdicts, and reward identifiers.
The parser independently reconstructs this key from the observable records and task request.

The horizon is 1 through 6 actions.
The file limit is 64 MiB.
Each table has at most 100,000 states and 32 actions.
The read path requires a regular file and rejects duplicate JSON fields.
The table contains synthetic evidence only.
The parser does not establish source authenticity or a real business outcome.
