---
name: rl-curriculum
description: "Design and test an RL practice schedule against fixed and random schedules under the same interaction budget."
---

# /rl-curriculum

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Determine whether a task schedule changes the declared outcome under a fair comparison.

## Discover

1. Read task families, learner feedback, failure coverage, available scheduler hooks, and the approved budget.
2. Separate training feedback from reserved evaluation outcomes.
3. Identify fixed and random schedules that use the same available tasks.

## Execute

1. Write the scheduler rule, information access, update frequency, and stopping rule.
2. Build the scheduler in the project's supported task-selection interface.
3. Compare the candidate, fixed, and random schedules under matched seeds and interaction budgets.
4. Use training-only observations to update the schedule.
5. For the finite operations example, inspect `avalon world-curriculum` and the policy experiment's schedule conditions.
6. Do not call the scripted world demonstration model training.
7. Preserve task counts, replay identities, updates, failures, and final candidate hashes.
8. Evaluate frozen candidates on reserved groups with `/rl-eval`.

## Verify

1. Check that evaluation outcomes never steer practice selection.
2. Check actual interactions and allowed task exposure across schedules.
3. Retain fixed practice when the comparison does not support the candidate.
4. Report ties and losses with the same detail as gains.

## Deliver

- Scheduler source and tests.
- schedule.json: task sequence, feedback, seeds, and exposure.
- curriculum.md: equal-budget comparisons and negative results.

## Capability boundary

Finite schedules already exist. A broader trainer requires a tested task-selection hook and actual equal-budget learner execution.
