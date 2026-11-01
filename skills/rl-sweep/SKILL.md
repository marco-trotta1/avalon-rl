---
name: rl-sweep
description: "Execute a frozen, bounded RL experiment matrix across settings and seeds, retain every run, and compare development outcomes without tuning on final evaluation."
---

# /rl-sweep

Read [the workflow protocol](../_shared/workflow.md) as a reference.
Before performing its context or setup steps, read [the runtime and selection procedure](../_shared/selection.md).
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Execute the complete declared experiment matrix and retain comparable training, development evaluation, and resource records.

Example: `/rl-sweep Compare two learning rates over three training seeds within 12000 total decisions`.

## Discover

1. Read the task contract, supported trainer, settings, seed groups, baseline, and saved resource budget.
2. Identify development evaluation groups that remain separate from training and final evaluation.
3. Inspect the installed Python command help. A declared framework does not establish a working adapter.

## Execute

1. Freeze the settings, candidate roster, training seeds, development groups, interaction limits, and stopping rule in a manifest.
2. Calculate the complete interaction budget before launching the first run.
3. Give each condition and seed a new output directory. Preserve prior runs and checkpoints.
4. For published CartPole support, execute bounded `gym-train` runs and then `gym-eval` on frozen checkpoints.
5. Use `gym-sweep` only when the inspected Python installation provides that command and its declared input format.
6. Assign distinct output directories to parallel workers. Tell workers to preserve other workers' files and source changes.
7. Stop at the frozen time, interaction, cost, or failure boundary. Record unexecuted cells and partial outputs.
8. Retain every condition, checkpoint identity, training receipt, evaluation outcome, failed run, elapsed time, and cost status.
9. Compare the complete matrix against the named simple baseline. Report the actual independent sample unit.
10. If selection is required, apply the shared fixed comparison procedure to a separately frozen set of bounded development trials.
11. Freeze the selected candidate before handing it to `/rl-eval` on reserved final groups.

## Verify

1. Check the declared and actual condition counts, seeds, updates, interactions, and output identities.
2. Check that development and final evaluation groups do not overlap training groups where separation is required.
3. Retain missing cells in the ledger. Do not select a winner by silently dropping failed conditions.
4. Use `/rl-ablate` when the goal requires a controlled estimate of one component's effect.

## Deliver

- sweep.json: the frozen matrix, groups, limits, and planned output paths.
- ledger.json: every attempted, failed, completed, and unexecuted condition.
- Checkpoints, training receipts, and development reports in distinct directories.
- result.md: baseline comparisons, uncertainty, resource use, and final evaluation handoff.

## Capability boundary

Published Python support provides bounded CartPole training and evaluation. Other trainers require verified adapters. A sweep does not establish improvement by itself.
