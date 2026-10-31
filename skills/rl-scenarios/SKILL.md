---
name: rl-scenarios
description: "Generate structured RL task families, valid alternatives, stress cases, and reserved groups. Use to expand coverage without leaking final evaluation cases into training."
---

# /rl-scenarios

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Provide valid case families and a frozen split that expose meaningful behavior differences.

## Discover

1. Read the task specification, environment schema, existing cases, failures, and permission rules.
2. Identify coverage dimensions such as record structure, ambiguity, action history, interruption, and task family.
3. Inspect the grouping key required by the domain.

## Execute

1. Implement a seeded case generator in the project.
2. Generate known valid alternatives, invalid attempts, boundary conditions, and unavailable-evidence cases.
3. Declare construction invariants and test them independently of the generator.
4. Separate identifier renaming from changes that introduce a new task family.
5. Reserve complete groups before training, reward repair, or candidate selection.
6. Write the generator version, seeds, group definitions, artifact hashes, and allowed uses.
7. When using the Avalon holdout format, run `avalon trace-holdout --data HOLDOUT --out REPORT`.
8. Retain uncertain labels for review instead of forcing them into positive or negative controls.

## Verify

1. Check construction invariants and known expected outcomes.
2. Check exact overlap and declared family or group separation.
3. Record who saw reserved cases and when. Do not claim a blind holdout from labels alone.

## Deliver

- A seeded generator and invariant tests.
- scenarios.json: cases, expected outcomes, and uncertainty markers.
- split.md: grouping, seeds, hashes, exposure, and permitted uses.

## Capability boundary

Avalon supplies paired and declared-holdout checks. Domain semantics and new case generators require executed project-specific validation.
