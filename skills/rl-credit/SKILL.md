---
name: rl-credit
description: "Trace rewards through returns, advantages, action boundaries, roles, masks, and groups. Use for suspected credit assigned to padding, tools, or unrelated decisions."
---

# /rl-credit

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Find mechanical credit-assignment errors and separate them from causal hypotheses.

## Discover

1. Read the reward schedule, advantage implementation, baseline, discount, grouping, token roles, and active loss masks.
2. Locate actual credit receipts or add a narrow recorder at the learner boundary.
3. Identify terminated and truncated behavior before recomputing returns.

## Execute

1. For a built-in training receipt, run `avalon-python credit-audit --source CREDIT --output REPORT`.
2. Recompute the declared returns and advantages with an independent simple implementation.
3. Check baseline provenance, group boundaries, inactive rows, tool roles, padding, and finite values.
4. Compare the recomputed credit with the values that enter the actual loss.
5. Construct a changed-mask or changed-return control and require its audit to fail.
6. Map each flagged row to its source decision, reward, role, and active loss term.
7. Use action interventions only when the environment supports controlled replay.
8. Label causal attribution as a hypothesis until a controlled experiment supports it.

## Verify

1. Bind the audit to the actual training receipt and declared numerical tolerance.
2. Require a reproducing mismatch before claiming an assignment bug.
3. Report unsupported advantage formulas or missing values as inconclusive.

## Deliver

- credit-map.md: decision-to-reward-to-loss mapping.
- credit-report.json: numerical and grouping findings.
- A failing regression and patch when the observed bug can be repaired.

## Capability boundary

The built-in credit audit checks the declared REINFORCE receipt. General advantage methods need explicit formulas and verified capture adapters.
