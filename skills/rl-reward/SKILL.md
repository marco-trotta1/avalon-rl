---
name: rl-reward
description: "Implement and test an RL reward or grader from declared outcomes, history, and authority. Use for new rewards or disagreement between score and task completion."
---

# /rl-reward

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Provide a grader that implements the declared task rules and handles missing evidence explicitly.

## Discover

1. Read the task contract, environment state, successful traces, failures, and current reward code.
2. Identify the observable outcome, protected state, authority, history requirements, and valid alternatives.
3. Separate policy-visible observations from grader evidence.

## Execute

1. Write the reward rules before implementing the grader.
2. Implement explicit success, failure, partial, and unknown cases.
3. Test completion claims against actual state changes.
4. Test final-state checks against unauthorized intermediate changes and protected-record edits.
5. Test valid alternative action sequences and incomplete traces.
6. For a trace contract, run `avalon trace-audit --data SNAPSHOT --contract CONTRACT --out REPORT`.
7. For the operations world, compare the declared reward with the independent world oracle.
8. Update the reward documentation and keep the control cases with the source.

## Verify

1. Execute all declared controls and inspect their scores and independent outcomes.
2. Check that the grader does not expose expected answers to the policy.
3. Send remaining disagreement cases to `/rl-break` and preserve unknown evidence.

## Deliver

- Reward source, task contracts, and control tests.
- reward-controls.md: actual scores, independent outcomes, and disagreements.
- result.md: implemented rules and evidence limits.

## Capability boundary

Current trace contracts and operations-world verifiers cover explicit rules. A passing contract check does not validate an unspecified reward objective.
