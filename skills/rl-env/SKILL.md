---
name: rl-env
description: "Build and test an executable RL environment or adapter around the current project. Use for reset, action, observation, reward, and ending semantics."
---

# /rl-env

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Provide an executable environment whose declared contract is covered by actual rollouts.

## Discover

1. Read the accepted task specification, project interfaces, dependencies, and existing environment code.
2. Determine whether the project uses Gymnasium, an agent tool loop, an offline dataset, or another declared interface.
3. Find the narrowest existing environment checker and relevant tests.

## Execute

1. Implement the adapter in project source. Parse external input once at the boundary.
2. Make action variants and ending states explicit in the domain types.
3. Implement reset, step, observations, reward, termination, truncation, and final observations.
4. Keep the grader's hidden state outside policy observations.
5. Exercise known-valid, invalid, random, and interrupted trajectories.
6. For Gymnasium, run the installed environment checker and seed-repeat checks.
7. For the built-in operations world, use `avalon world-run --data PLAN --out REPORT` for each declared control.
8. Add a supported recorder when needed. Verify its output against the actual executed trajectory.

## Verify

1. Check invalid actions, repeated reset, terminal behavior, and a truncated episode.
2. Compare recorded observations, rewards, endings, and final observations with execution.
3. Run narrow regression tests and update the environment documentation.

## Deliver

- Environment source and adapter tests.
- conformance.md: executed controls, interface checks, and limits.
- rollouts: private trajectories bound to the tested source.

## Capability boundary

The built-in world and Gymnasium recorder provide supported starting points. Verify each newly authored external adapter before using its results.
