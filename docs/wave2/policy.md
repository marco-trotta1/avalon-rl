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

## Actual learning

Call `train_policy(table, seed=7, interactions=400, arm="history")` from `avalon_lab.policy_learning`.
The learner executes one tabular Q update for each interaction.
It records the previous value, target, updated value, table hash, state, action, and ending signals.
The budget counts actions, including exploratory actions and early episode endings.
The learner rejects evaluation tables before the first update.

The state key retains the finite horizon.
A truncated state has no continuation actions in this finite experiment.
Its continuation value is zero for that reason.
The learner preserves termination and truncation as separate signals.
This rule does not redefine external time limits in other environments.

The exploration stream uses a separate seeded Python random generator.
The final policy has immutable weights and a content hash.
A tolerance of `1e-12` groups greedy ties caused by float64 rounding.
The method is ordinary tabular Q-learning.
No new learning algorithm is claimed.
