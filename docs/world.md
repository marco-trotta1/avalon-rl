# Synthetic operations world

The world uses deterministic in-memory invoice records and one ticket.
It does not use SQLite or external services.
`resetWorld({seed})` creates the state.
`stepWorld({state, action})` returns a new state and preserves the input state.

The operator can pay only the invoices in the authority record.
The reducer retains unauthorized payments and marks their events.
This behavior lets an independent oracle inspect prohibited effects.
It is a laboratory rule, not a payment security mechanism.
Payment amounts replace the recorded paid amount.
The action does not transfer money.

The actions pay an invoice, close the ticket, claim completion, or finish the episode.
Finishing does not establish success.
The transition preserves termination and truncation as separate signals.
Both signals can be true.
The state type distinguishes active, terminated, truncated, and simultaneous ending states.
`stepWorld` accepts only an active state.
Its runtime guard also rejects ended states from untyped callers.
Truncation closes the episode, including when it coincides with termination.

The tests cover deterministic resets, immutable transitions, authority evidence, and ending signals.
All records and outcomes are synthetic.

## Task catalog

`worldTasks({seed})` returns four tasks with explicit goals and known-good actions.
Two invoice tasks form the training family.
Two ticket tasks form a separate evaluation family.
This split does not establish generalization to real operations.

`taskEvidence({task, state})` reports payment, ticket, protected-invoice, and authority evidence separately.
Protected invoices must retain their amounts and payment state.
Completion claims and ending signals do not contribute to these checks.
The catalog tests execute all known-good sequences with three seeds.

## Replay receipts

`replayWorld({initial, actions, maxSteps})` records each immutable transition and its SHA-256 state hash.
The canonical encoding sorts object keys and retains array order.
It rejects non-JSON values.
The default limit is 128 transitions.
The maximum accepted limit is 10,000 transitions.

`compareReplay({expected, actual})` reports the first transition divergence.
It compares the observations, actions, both ending flags, and stored state hashes.
It also compares the final state and stop summary.
The `component` field distinguishes initial, transition, and summary differences.
A summary difference uses the last transition index, or `-1` for an empty replay.
Index `-1` identifies the initial state.
Later indices identify transitions, starting at zero.
A missing state is a divergence.
Matching hashes establish repeatability of these records, not outcome correctness.
A hash is not a signature or a source authenticity claim.
The receipt keeps both ending flags when the step limit and termination coincide.

## Reward and outcome checks

`weakWorldVerifier(receipt)` intentionally rewards only the completion claim.
`oracleWorldVerifier({task, receipt})` independently compares final records against the task goals.
It checks protected invoices and payment authority from the recorded actions.
It does not use the event authorization label or the completion claim.
It also checks the initial hash and the final receipt state.
The oracle does not prove arbitrary trace integrity or a real business outcome.

`runWorldDemo({seed})` returns the `avalon.world/v1` report.
The demonstration compares two candidates per task: known-good actions and a false completion claim.
For seed 7, the weak baseline falsely accepts 4 of 8 episodes and falsely rejects 4 of 8 episodes.
The finite synthetic sample has no sampling uncertainty within these eight candidates.
It provides no population accuracy estimate.
The demonstration makes zero API calls and costs 0 USD in API fees.
It does not measure local runtime latency.

## Controlled verifier challenge

`runWorldChallenge({seed})` evaluates five valid action variations for each catalog task.
The variations include known-good actions, a false claim, a correct claim, an omitted goal, and an unauthorized payment with restoration.
The restoration case exposes an authority violation that final payment amounts cannot show.
All candidates use the same typed actions as the world.
The report retains every case, including false rejects and correct accepts.

At seed 7, the weak baseline falsely accepts 12 of 12 oracle-invalid candidates.
It falsely rejects 4 of 8 oracle-valid candidates.
These counts cover 20 candidates and have no sampling uncertainty within that finite set.
They are not population estimates.
The challenge makes zero API calls and costs 0 USD in API fees.
It does not measure local runtime latency.

`minimizeFalseAccept({task, actions})` removes actions while the false accept persists.
Its result permits no further single-action deletion.
This guarantee does not establish a global shortest counterexample.
The public `examples/world/claim-only.json` fixture contains only synthetic records.

## Bounded counterexample search

`searchWorldCounterexamples({seed, budget, maxDepth})` enumerates a hand-authored six-action alphabet for each task.
It includes claims, ticket closure, finish, two exact payments, and one zero payment.
Each prefix stops after finish.
The search visits shorter sequences first and alternates tasks at each sequence index.
It retains all evaluated cases, including agreements and false rejects.

The default depth is 3 and the default budget is 1,000 candidates.
This declaration contains 744 candidates across four tasks.
The maximum accepted depth is 4 and the maximum budget is 10,000 candidates.
The report gives the evaluated count, the unexplored count, and task coverage.
An exhaustive result applies only to the declared alphabet and depth.
No search result establishes absence of other counterexamples.

## Evidence-driven curriculum

`startWorldCurriculum({seed, budget})` creates a deterministic task selection state.
`selectWorldTask({state, split})` consumes one budget unit and returns a pending state.
`recordWorldOutcome({state, receipt})` derives evidence from the oracle and weak verifier.
The types prevent selecting another task from a pending or exhausted state.
The state retains failures and verifier disagreements.

The selector gives unseen tasks priority.
It then gives failed tasks and verifier disagreements priority.
Task identifiers break equal scores.
Two successful training outcomes unlock difficulty 2.
A rewarded false claim does not unlock difficulty.
`worldCurriculumCoverage(state)` reports attempts, successes, and disagreements for each family.

The default split is training.
Evaluation requires an explicit `split: "eval"` selection.
Evaluation outcomes do not promote difficulty or change training task scores.
This selector does not train a policy, update weights, or establish learning progress.

## Shared experience snapshots

`makeWorldSnapshot({seed, maxSteps})` exports all 20 challenge episodes through the shared `avalon.snapshot/v1` parser.
`worldEpisodeSnapshot({id, task, receipt})` exports one replay receipt.
Each transition preserves its observation, action, next observation, reward, and both ending signals.
The final observation remains the actual final state.
The reward is 1 after a completion claim and 0 before it.
This rule intentionally permits a reward on a failed outcome.

Episode metadata records the family, split, independent verdicts, reasons, stop condition, and state hashes.
A terminated transition has bootstrap mask 0.
A transition with truncation alone has bootstrap mask 1.
Both ending signals remain true when they coincide.
The snapshot marks all evidence as synthetic.
The exporter rejects empty episodes through the shared parser.
