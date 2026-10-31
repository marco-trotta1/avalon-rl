---
name: rl-diagnose
description: "Diagnose stalled, unstable, or misleading RL runs by testing competing causes. Use when reward, task completion, likelihoods, or updates disagree."
---

# /rl-diagnose

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Explain an observed run failure with discriminating evidence or a precise unresolved test.

## Discover

1. Read run configuration, source changes, metrics, rewards, traces, checkpoints, and previous working controls.
2. Write the exact observed symptom and its baseline.
3. List competing causes before editing the trainer or grader.

## Execute

1. Check data preservation with `/rl-data` before blaming the optimizer.
2. Check reward/outcome disagreement with `/rl-break` and frozen controls.
3. Check sampling and masks with `/rl-probs` and `/rl-credit` when their evidence exists.
4. Check numerical values, update magnitudes, group sizes, policy entropy, and budget exhaustion.
5. Choose the cheapest check that separates the leading explanations.
6. Run a small controlled test and record both supporting and contradicting observations.
7. Add a failing regression before a code correction.
8. Apply the smallest supported correction and rerun the discriminating check.
9. Retain explanations that remain untested as hypotheses.

## Verify

1. Require an observed failure and a separating check for each confirmed cause.
2. Check the correction against the previous working control.
3. Do not diagnose from a reward chart alone or hide a failed hypothesis.

## Deliver

- diagnosis.md: symptom, hypotheses, separating tests, and evidence.
- Reproduction inputs and regression tests.
- A tested correction or the exact missing test and inputs.

## Capability boundary

The host investigates the actual project. Missing telemetry limits the conclusion; it does not justify an invented root cause.
