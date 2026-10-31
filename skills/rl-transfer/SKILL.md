---
name: rl-transfer
description: "Test frozen RL behavior under declared shifts, new task families, renamed records, and operating conditions."
---

# /rl-transfer

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Identify the tested boundary of a policy or grader under a declared distribution shift.

## Discover

1. Read the frozen candidate, original task distribution, training exposure, and proposed shift.
2. Separate identifier renaming, parameter changes, new task families, and adaptation.
3. Choose controls that reveal whether the shift preserves the original task semantics.

## Execute

1. Freeze the candidate and shift generator before final execution.
2. Generate the shifted suite with declared seeds, groups, invariants, and expected outcomes.
3. For declared identifier changes, use `avalon trace-pair --source SOURCE --target TARGET --contract CONTRACT --out REPORT`.
4. Treat that audit as transition preservation rather than new-family learning evidence.
5. Run the frozen policy through the supported project evaluator on original and shifted cases.
6. Compare with a random or other simple baseline on the same cases.
7. Perform no learner updates for a zero-shot claim.
8. Run adaptation as a separately budgeted condition with separate data and artifacts.

## Verify

1. Check candidate hashes before and after evaluation.
2. Check semantic controls and shift construction invariants.
3. Report every tested shift, failed condition, and untested family.
4. Do not treat new seeds in the same family as evidence of broad transfer.

## Deliver

- shift-spec.md: distribution changes, invariants, and exposure.
- transfer.json: per-shift outcomes and baseline results.
- transfer.md: tested boundaries, uncertainty, and failure cases.

## Capability boundary

Avalon supplies paired trace checks and finite family holdouts. New shift generators and model runners require executed validation.
