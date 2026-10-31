---
name: rl-ablate
description: "Run paired RL comparisons that isolate a reward, sampler, algorithm, or data change. Use to test what causes an observed difference."
---

# /rl-ablate

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Estimate a declared component effect under a frozen, comparable experiment.

## Discover

1. Read the claimed effect, candidate changes, prior runs, grouping, and resource budget.
2. Identify confounders and the smallest independent comparison matrix.
3. Choose a simple baseline and reserve the final comparison before candidate selection.

## Execute

1. Write the hypothesis, factor levels, seeds, sample unit, budget, metric, and uncertainty method before execution.
2. Pair source data, training seeds, evaluation groups, and interaction budgets where the design allows.
3. Run each planned condition through the verified trainer or environment.
4. Use built-in `gym-train` runs for supported CartPole comparisons and `gym-eval` for frozen checkpoints.
5. Keep artifact directories distinct for every condition and seed.
6. Record failed runs, missing cells, numerical failures, and stopping reasons.
7. Calculate paired effects over independent seeds or groups.
8. Report quality, latency, and cost alongside the outcome comparison.
9. Separate exploratory selection from the final held-out test.

## Verify

1. Check that only the declared factor differs or disclose every remaining confounder.
2. Verify actual interaction counts and candidate identities.
3. Do not select a winner from incomplete conditions or hide negative results.

## Deliver

- experiment.md: frozen comparison matrix.
- comparison.csv or comparison.json: every condition and sampling unit.
- ablation.md: paired effects, uncertainty, costs, confounders, and negative results.

## Capability boundary

The workflow uses supported project runners. The finite policy experiment provides an additional bounded comparison path.
