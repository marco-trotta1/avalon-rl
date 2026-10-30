# Avalon verifier research

Date: 2026-10-30.
Scope: Four research iterations. No product change or experiment runs occur.

## Recommendation

Build a local experiment that measures what a policy learns from incomplete reward contracts.
Connect each measured failure to a replayable trace, a declared rule, and a bounded repair.
Use the existing operations world before adding another task catalog.

The concrete question is this:
Does adding a history rule change a learned policy when a final-state check accepts restored damage?

The current world already retains unauthorized payment actions after their effects are restored.
Its independent verifier checks those actions.
Its curriculum currently runs a known solution and does not train a policy.
These facts come from `docs/world.md`, `src/world/state.ts`, and `src/world/curriculum.ts`.

This work can establish a useful local capability.
It cannot establish a new learning algorithm or a novel research category.

## Iteration 1: Side effects, then negative controls

Seed: The existing authority-restoration counterexample.

[Finding Side-Effect Loopholes, version 2](https://arxiv.org/html/2610.09142v2) tests edits to correct AppWorld and WorkArena runs.
Its AppWorld repair adds one count assertion per affected template.
The repair rejects six duplicate runs and passes six correct runs.
This is author-reported evidence, not an Avalon replication.

The paper pins AppWorld 0.1.3.post1 and WorkArena 0.5.3.
Its supplement recomputes counts without executing the environments.
Protected AppWorld content and hosted credentials are absent.
It does not measure learned attacks or subsequent RL training.
It warns that repeated task versions do not supply independent population samples.

Decision: Basic mutation tests and frame rules already have direct prior work.
Require valid alternative solutions and already-correct verifiers as negative controls.
Do not claim an upstream defect from a copied synthetic example.

Next seed: Can repair change actual learned behavior?

## Iteration 2: Reward repair already exists

[Preference-Based Reward Repair, version 2](https://arxiv.org/html/2510.13036v2) learns an additive transition reward correction from preferences.
Its targeted exploration compares a proxy-optimal policy with a reference policy.
Its proof and experiments establish substantial prior work for iterative reward repair.
Avalon does not implement or reproduce that method.

Decision: Do not advertise counterexample-guided repair as Avalon's invention.
First measure a small policy under three declared reward rules.
Retain the simplest complete rule as a baseline.
If that baseline matches the candidate, report the tie.

Next seed: What can an invariance check establish?

## Iteration 3: Relabeling reveals shortcuts, with limits

[Isomorphic Perturbation Testing](https://arxiv.org/html/2604.15149) permutes object identifiers while preserving a logical task.
The authors use the paired test to expose instance-label shortcuts in induced rules.
They also compare training under extensional and isomorphic verification.
This is further prior work for combining transformed tasks with reward design.

Proposal: Evaluate an identical operations policy after changing record names and payment amounts.
Transform the task, actions, and allowed authority together.
Do not classify an inconsistent transformation as a policy failure.
Keep relabeling tests separate from new task-family tests.
New record names alone do not establish family generalization.

Next seed: A curriculum needs a real learner and budget comparison.

## Iteration 4: Curriculum methods and integration constraints

[ACCEL](https://accelagent.github.io/) evolves levels by editing cases with high estimated regret.
[Prioritized Level Replay](https://github.com/facebookresearch/level-replay) samples levels by estimated learning potential.
Those methods precede an Avalon task selector.
The PLR repository is archived.
Do not copy its old dependency environment into this project.

[Prime Verifiers](https://docs.primeintellect.ai/verifiers/environments) exposes reward functions, full rollout state, group rewards, and metrics.
Reward functions can deliberately mutate shared state in their declared execution order.
Rubric groups execute in parallel.
A mutation or an order-dependent result is therefore not automatically a defect.
An integration needs explicit allowed effects and dependency rules.

Decision: Compare fixed, random, and disagreement-driven task schedules with the same training budget.
Do not call the existing known-solution selector a learning result.

## Minimum decisive experiment

Freeze the generator, reward rules, feature map, holdout manifest, and budgets before scoring.
Hash each artifact.
Use a small CPU learner with recorded parameter updates.
Tabular Q-learning is sufficient if its state representation preserves the tested history.
An abstract feature policy needs a separate check for accidental oracle leakage.

Use these reward conditions:

1. A completion-claim reward. This is the existing intentionally weak control.
2. A goal and final-state reward. It checks the requested result and protected final records.
3. A history-aware reward. It also rejects prohibited actions, including changes later restored.

Use an independent evaluation implementation for all conditions.
Its observations must exclude reward-rule identifiers and expected verdicts.
Do not use a state encoding that hides a prohibited history from the history-aware learner.
Do not count hand-authored successful scripts as learned policies.

Measure valid task completion, prohibited actions, proxy return, and independent outcome separately.
Compare the candidate with random actions, a fixed schedule, a random schedule, and the simplest complete assertion.
Keep a known-good script as a ceiling and a fixture check.
It is not a trained baseline.

Use at least 20 paired training seeds for an initial run.
This is a proposed sample count, not a measured result.
Record each seed and every run, including failed learning.
Aggregate paired differences over seeds.
Report a bootstrap interval over seed clusters if that sampling model is appropriate.
Report exact finite counts for the fixed mutation suite.
Do not attach a population interval to repeated template variants.

Split by task generator family and mutation family.
Reserve one mutation class before the search begins.
Reserve evaluation seeds and task instances.
Keep the current invoice and ticket families separate in the report.
A policy trained only on invoice actions may fail ticket actions.
That failure is an informative out-of-distribution result.
It does not justify changing the evaluation family after scoring.

Record wall time, peak memory, versions, hardware, input hashes, and policy hashes.
Use no model API for this initial experiment.
Report API calls as zero and API fees as 0 USD only after execution confirms that boundary.
Local compute costs remain unpriced unless measured.

## Preserve the world and share an inert boundary

Keep the existing state reducer, task catalog, and verifiers unchanged.
Add an experiment exporter beside them.
It calls the existing reducer with a finite, declared action alphabet.
It exports reachable transitions under a bounded horizon.
The Python learner consumes that table instead of reimplementing the operations world.

Use a versioned JSON envelope, such as `avalon.mdp/v1`.
Keep these components explicit:

- The generator version, artifact hash, seed, family, split, and horizon.
- An initial state identifier and the available action identifiers for each active state.
- State observations with the task request and observable records.
- A transition for each available state and action pair.
- Both ending signals and a separate terminal outcome record.
- The concrete JSON action that each action identifier selects.
- Reward columns for the declared experimental conditions.

Include the remaining horizon and observable prohibited-action history in the state key.
Otherwise the state alias can make the experiment partially observed by accident.
Exclude task identifiers, split labels, reward-rule identifiers, and expected verdicts from policy observations.
Task requests may enter observations. Hidden expected outcomes may not.
Record the feature map and test collisions against the reward and transition rules.

Write separate training and evaluation tables.
The trainer receives only the training table.
The evaluator opens the evaluation table after it freezes the policy hash.
No evaluation reward updates the policy or the task schedule.

Export learned-policy episodes as `avalon.snapshot/v1`.
Preserve the actual observations, actions, rewards, next observations, and ending flags.
Put run identifiers and policy hashes in episode metadata.
Keep outcome contracts and expected labels in separate files.
The TS auditor consumes the snapshot and contract through its normal inert-file boundary.
It does not import Python code or invoke a model.

For the first exporter, the complete state can remain in a private evidence record.
The trainer receives only the declared feature view.
This keeps the policy observation testable without discarding the audit evidence.
Declare any state abstraction as part of the experiment.

## Eight TS audit slices

Each slice needs a focused behavior test and matching documentation.

1. Add a strict, versioned outcome-contract parser with explicit missing-evidence results.
2. Add total JSON path resolution with unambiguous array and object paths.
3. Add final-state goal and protected-field checks with explicit numeric tolerances.
4. Add temporal authority and history rules that detect changes later restored.
5. Add paired metamorphic checks with declared transformations and identity controls.
6. Preserve minimal counterexamples without changing the source snapshot.
7. Add frozen mutation-family partitions and valid-alternative acceptance controls.
8. Expose the audit through a CLI command and ordinary portable reports.

## Eight learned-policy slices

1. Export bounded MDP tables through the existing reducer and validate the shared JSON boundary.
2. Add seeded tabular Q-learning with parameter hashes and actual update receipts.
3. Add claim-only, final-state, and history-aware reward arms under identical transition dynamics.
4. Add fixed, random, and disagreement-driven schedules with equal interaction budgets.
5. Evaluate frozen policies on separate task and mutation families without updates.
6. Export every evaluated policy episode through the shared snapshot format.
7. Report paired seed differences, exact mutation counts, runtime, memory, versions, and hashes.
8. Add the experiment command and a reproducible result that retains every negative outcome.

Do not separate trivial documentation changes only to increase the PR count.
Stop expansion when a failed evidence gate removes the reason for a later slice.

## Disconfirmation and open evidence

The simple assertion may match every candidate result.
The disagreement schedule may not improve learning under an equal budget.
History rules may hurt completion because the learner cannot recover the relevant state.
Those outcomes must remain in the report.

No independent user workflow, customer demand, or algorithmic novelty is established.
No external benchmark defect is reproduced in this research.
No model or environment code runs.
The browser evidence and the repository inspection verify this research recommendation only.

Next queue: Run the fixed experiment before adding integrations or more worlds.
