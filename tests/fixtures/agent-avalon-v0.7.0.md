---
name: avalon
description: "Coordinate an RL goal across research, environment design, reward checks, training, and evaluation. Use when the user wants an end-to-end RL outcome."
---

# /avalon

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Complete the user's RL goal through a bounded sequence of verified workflows.

## Discover

1. Read the project profile, source, available adapters, and compatible prior run artifacts.
2. Identify the requested outcome, current bottleneck, permitted execution scope, and saved resource budget.
3. Write a task graph with concrete artifacts and a stopping rule. Separate known facts from assumptions.

## Execute

1. Select the smallest sequence of command workflows that can settle the goal.
2. Use `/rl-research` for an unresolved method and `/rl-spec` for an undefined task.
3. Use `/rl-data` or `/rl-probs` when the evidence path can explain a learning failure.
4. Use `/rl-env`, `/rl-scenarios`, and `/rl-reward` to construct executable task coverage.
5. Use `/rl-break` before trusting a grader and `/rl-harden` for a reproduced flaw.
6. Use `/rl-train`, `/rl-ablate`, and `/rl-curriculum` for a frozen, budgeted experiment.
7. Use `/rl-eval` and `/rl-transfer` after candidate freeze. Use `/rl-reproduce` before a supported release.
8. Read each selected skill from its sibling directory. Follow its completion rules.
9. Give workers distinct code or artifact ownership. Keep final evaluation separate from candidate construction.
10. Execute the next authorized step. Do not stop after producing a plan when executable work remains.

## Verify

1. Inspect every required worker result and underlying output.
2. Do not count missing slices, failed executions, or unsupported adapters as passes.
3. Check that the final conclusion answers the original goal and retains negative results.

## Deliver

- workflow.md: the task graph, budgets, dependencies, and stopping rule.
- result.md: the linked evidence, tested changes, and remaining limits.

## Capability boundary

The coordinator uses host tools and the installed Avalon engines. Host agent delegation is optional; sequential execution preserves the same gates.
