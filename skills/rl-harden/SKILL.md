---
name: rl-harden
description: "Repair a demonstrated reward or grader failure with a failing regression and frozen valid controls. Use after a replayable counterexample exists."
---

# /rl-harden

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Repair the reproduced failure while retaining valid task behavior.

## Discover

1. Load the counterexample, exact grader version, task rules, and declared controls.
2. Check the producing run's bindings and reproduce the failure.
3. Reserve final evaluation before selecting a patch.

## Execute

1. Add the failing regression first. Run it and retain the failure output.
2. Identify the incorrect rule or missing evidence boundary.
3. Implement the smallest correction in the actual grader.
4. Run the original counterexample and valid alternative controls.
5. Check history, authority, protected state, partial completion, and missing evidence where relevant.
6. Record the intentional source change with the shared drift procedure.
7. Run fresh checks against the corrected source.
8. Update the grader documentation and retain the failed case.

## Verify

1. Confirm that the original exploit no longer earns the invalid reward.
2. Confirm that frozen valid controls still pass.
3. Record newly rejected behavior and unresolved semantic assumptions.
4. Do not use final holdout results to choose among patches.

## Deliver

- A grader patch and the failing regression.
- repair.md: before/after behavior, valid controls, and source identities.
- counterexample.json: retained reproduction for future checks.

## Capability boundary

This workflow repairs the project's executable grader. It does not infer a domain rule that the task specification leaves unresolved.
