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

## Frozen partitions

`freeze_holdout` records complete task instances before training starts.
The manifest contains each input hash, task, family, generator seed, horizon, and declared role.
It rejects a reused instance, reused training seed, wrong role, or overlapping family holdout.
The manifest reads inert documents for identity and hashing.
It does not score an evaluation rollout.

`load_training` returns only training tables.
`load_evaluation` requires a frozen policy and checks each input hash before parsing evaluation tables.
The learner and scheduler never receive evaluation records.
Same-family evaluation uses new generator seeds within a training family.
Family evaluation uses new seeds and a separate family.
Report these partitions separately.
The full reachable training table does not support a mutation-family holdout claim.

## Frozen experiment

`run_policy_experiment` accepts keyword arguments: `train_paths`, `same_family_paths`, `family_paths`, `output`, and optional `plan`.
Each path collection is a tuple of `Path` objects.
Select a new output directory.
The runner writes the plan and manifest before it updates a parameter.
It keeps every condition, seed, update receipt, policy, episode, and control.
A failure leaves the completed receipts and a failure record.

The approved plan uses learner seeds 0 through 19 and 2,400 actions per arm and schedule.
The horizon is 4. The learning rate is 0.3, the discount is 0.95, and epsilon is 0.2.
The arms are `claim`, `final`, and `history`.
The schedules are `fixed`, `random`, and `disagreement`.
Training uses both invoice tasks at generator seeds 7 and 8.
Same-family evaluation uses both invoice tasks at seeds 1007 through 1010.
Family evaluation uses both ticket tasks at seeds 2007 through 2010.
The evaluation seed is `(1000003 + learner_seed * 4099 + table_index * 131) % 2**32`.
All conditions use the same evaluation seed rule.

Paired comparisons resample whole learner seeds 2,000 times with bootstrap seed 104729.
The interval conditions on this fixed synthetic task suite.
Task repeats do not increase the number of seed clusters.
Exact fixture counts carry no population interval.
The history reward is the simplest complete assertion baseline.
The comparison can show parity with that baseline.

The report records per-run time, total time, the process memory peak, versions, hardware, and content hashes.
The memory peak includes the interpreter and earlier imports.
API calls and API fees are zero because this runner has no model or network client.
Local compute costs remain unpriced.
The report preserves intervals that include zero and every failed learning condition.

## Policy evidence

`policy_snapshot(table, evaluations=(result,), seed=7)` returns the actual normalized learner observations.
Set `view="world"` to export the raw table observations for outcome diagnosis.
The world view uses the recorded stage. The policy view uses the learner stage.
They represent an explicit observation transform and need separate interpretations.
Both views preserve actual actions, rewards, next observations, and independent ending signals.
The bootstrap mask uses termination only.

`write_policy_evidence` writes both merged snapshots and a separate outcome file.
Its keyword arguments are `tables`, `evaluations`, `seed`, `directory`, and `name`.
The result maps each output filename to its SHA-256 byte hash.
It requires the original table hash and rejects a modified rollout transition.
The files use owner-only permissions and cannot replace existing files.

The experiment writes these files for each seed, reward arm, and schedule:

- `runs/seed-0-history-fixed.json` retains updates, weights, training episodes, and evaluation receipts.
- `snapshots/seed-0-history-fixed-world.json` retains raw observations for an outcome audit.
- `snapshots/seed-0-history-fixed-learner.json` retains the exact policy input features.
- `snapshots/seed-0-history-fixed-outcomes.json` retains expected and independent outcomes separately.

Episode metadata includes the table hash, policy hash, family, generator seed, evaluation seed, strategy, reward arm, and observation view.
Expected verdicts remain outside both observation views and their metadata.
A normal TypeScript snapshot audit can read either view through the existing inert-file boundary.
A matching self-audit establishes record consistency only.
The rollout traverses the exported table. It does not reexecute the TypeScript environment.

Episode identities bind the table hash, policy hash, evaluation seed, strategy, reward arm, and merged ordinal.
The world, learner, and outcome files use the same identity.
Distinct generator instances retain distinct identities even when they share an evaluation seed.

## Executed result: 2026-10-30

The approved experiment executes 180 runs and 432,000 Q updates.
Each condition uses 20 learner seeds and 160 evaluation episodes per partition.
Each partition has eight fixed table instances. Repeated instances do not establish independent task families.
The [summary](../../examples/policy/benchmark-summary.json) retains the plan, input hashes, source hashes, versions, controls, intervals, and negative results.

| Reward and schedule | Same-family valid | Prohibited episodes | Ticket-family valid |
| --- | --- | --- | --- |
| Claim, fixed | 8/160 | 48/160 | 15/160 |
| Claim, random | 12/160 | 52/160 | 15/160 |
| Claim, disagreement | 3/160 | 67/160 | 15/160 |
| Final, fixed | 140/160 | 20/160 | 15/160 |
| Final, random | 132/160 | 28/160 | 15/160 |
| Final, disagreement | 130/160 | 19/160 | 15/160 |
| History, fixed | 160/160 | 0/160 | 15/160 |
| History, random | 160/160 | 0/160 | 15/160 |
| History, disagreement | 160/160 | 0/160 | 15/160 |

The prohibited-episode column refers to same-family evaluation.
The fixed final-state policy has mean proxy return 1.0 across its 160 same-family episodes.
Its independent valid count is 140/160.
The fixed history policy has mean proxy return 1.0 and independent valid count 160/160.
These figures separate reward acceptance from actual task completion under the declared rules.

The fixed history arm exceeds the fixed final-state arm by 0.125 in mean valid fraction.
Its paired seed percentile interval is [0.05, 0.225], with 20 clusters and 2,000 resamples.
This interval conditions on the eight fixed same-family table instances.
It does not estimate performance in other task families or real operations.

The disagreement schedule gives no history-arm gain over fixed or random selection.
Its paired difference is 0.0 with interval [0.0, 0.0] against both baselines.
The claim and final disagreement schedules have no positive paired interval against either schedule baseline.
The candidate schedule therefore fails its improvement gate in this experiment.

All nine learned conditions produce 15/160 valid ticket-family episodes.
The seeded random-action baseline produces the same 15/160 count.
Every ticket-family learner state is unseen during training.
The result establishes no task-family transfer.
The known-good ceiling accepts 160/160 episodes in both partitions.
The history reward remains the simple complete assertion. No advantage over that assertion is established.

The measured run takes 22,748.049 ms, with one complete timing sample and no timing interval.
The measurement includes training, evaluation, and per-run output writes.
It excludes input freeze and the final summary write.
The process memory peak is 58,785,792 bytes, with one measurement including the interpreter and earlier imports.
Python is 3.13.5 on Darwin arm64. NumPy is 2.4.2 and Avalon Python is 0.1.0.
API calls are 0 and API fees are 0 USD. Local compute costs remain unpriced.
The summary records condition timings beside each accuracy result.

The plan hash is `8aaec5290c2ed99916a27257c6c95d97aa85f213c1b24ab54f3ffb557150003a`.
The holdout hash is `a8d6b5cdb205bf892c4efca182ecb5b61127580b2e0778a7187e21c2422ba039`.
The final semantic result hash is `e7fe50f8c82711645adf0975b71db4d0d84eb731e6882fda0fe19af8b93c8661`.

The first run completes before independent review finds an episode-identity defect in the public exporter.
A failing CLI regression reproduces duplicate episode keys across two generator instances with a shared evaluation seed.
The correction binds each episode to its full table and evaluation identity.
The original run remains preserved as pre-fix evidence.
The corrected run uses the same frozen inputs, rewards, budgets, seeds, schedules, and statistics.
All 180 policy hashes, update hashes, training counts, and evaluation score tables match exactly.
The final evidence uses the corrected snapshot identities.
