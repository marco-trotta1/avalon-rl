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

## Rewards and independent outcomes

The same transition table supplies `claim`, `final`, and `history` reward columns.
Each arm uses identical dynamics and the same action budget.
`evaluate_policy` freezes the policy and uses a separate evaluation random stream.
`evaluate_baseline` supports random actions and the known-good script.
The script is a ceiling and fixture check. It is not a learned policy.

The independent Python outcome check reads the task request, final records, initial authority, and actual action sequence.
It does not read reward values or expected verdicts to decide success.
The result compares its verdict with the table's recorded verdict.
The check shares the published task specification with the TypeScript verifier.
That shared specification limits its independence.

The checked-in operations fixture comes from the TypeScript reducer at seed 7 and horizon 4.
It contains 160 states and 392 transitions.
A protected payment followed by its restoration still produces two prohibited actions.
The final-state reward accepts the restored result.
The history-aware reward and independent outcome check reject it.
This is a controlled synthetic case, not an upstream defect.

## Equal budgets

Call `train_schedule(tables, seed=7, interactions=1000, schedule="fixed")` from `avalon_lab.policy_schedule`.
Use `schedule="random"` for uniform random task selection.
The fixed schedule cycles through the supplied training tables.
Task selection occurs at episode boundaries.
Both schedules count the same action interactions, regardless of episode length.
The task stream and action exploration stream use separate seeded generators.

Each episode record includes its table hash, action sequence, interaction range, completion state, and independent training outcome.
A budget can stop within an episode.
The record then has no terminal outcome and adds no invented transition.
All training artifacts must be distinct and carry the training split.
Cross-table feature aliases must preserve the same transition and reward rules.

## Training disagreements

Use `schedule="disagreement"` for the candidate task schedule.
It visits each training table once before it uses outcome scores.
It then selects the largest smoothed disagreement rate: `(disagreements + 1) / (attempts + 2)`.
A disagreement means positive proxy return and invalid outcome, or nonpositive proxy return and valid outcome.
The independent outcome check runs only after a training episode ends.
A partial episode does not update the score.
The schedule records each selection reason and score.
The candidate never receives an evaluation table or an evaluation result.

The method is a simple task-selection heuristic.
Existing curriculum methods precede this experiment.
A comparison can show no gain over fixed or random selection.
Keep that result in the experiment report.
