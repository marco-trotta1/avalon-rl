---
name: rl-train
description: "Run a real bounded RL training experiment with a verified adapter, frozen settings, actual update receipts, and checkpoints."
---

# /rl-train

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Execute the planned learner within its approved budget and preserve its actual updates and outputs.

## Discover

1. Read the accepted task, experiment plan, data split, trainer source, dependencies, hardware, and saved budget.
2. Identify the exact supported trainer adapter. Detection alone does not validate execution.
3. Reserve evaluation seeds or groups before running training.

## Execute

1. Run a bounded smoke test for the actual trainer and inspect its updates.
2. Freeze the source, data, reward, seeds, algorithm settings, interaction budget, and stopping rule.
3. For built-in CartPole, run `avalon-python gym-train --output NEW_DIRECTORY --environment CartPole-v1 --seed SEED --episodes EPISODES --max-steps STEPS`.
4. Use explicit learning rate and discount when the experiment changes their defaults.
5. Inspect checkpoint.json, training.json, and credit.json.
6. For an existing repository trainer, invoke its verified adapter with the frozen manifest and approved limits.
7. Stop at the declared interaction, time, cost, or failure boundary.
8. Record interrupted and failed runs. Keep partial artifacts.
9. Hand the frozen candidate to `/rl-eval` without selecting it on final evaluation results.

## Verify

1. Confirm nonzero executed transitions and actual parameter updates.
2. Bind checkpoints and receipts to the source, configuration, and training seed set.
3. Read numerical failures and stopping reasons from the actual output.
4. Do not present a finite demonstration as a language-model training run.

## Deliver

- experiment.md: frozen plan and execution bounds.
- checkpoint.json, training.json, and credit.json for the built-in trainer.
- result.md: execution status, resource records, and evaluation handoff.

## Capability boundary

Built-in training is NumPy REINFORCE on CartPole-v1. Existing finite Q-learning remains available. Other algorithms require validated project adapters.
