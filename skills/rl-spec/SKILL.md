---
name: rl-spec
description: "Define an RL task, success rules, actions, rewards, authority, budgets, and evaluation splits. Use before building an environment or training on an ambiguous goal."
---

# /rl-spec

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Turn the requested behavior into an executable task and an assessable experiment.

## Discover

1. Read the domain code, interfaces, existing rewards, policies, tests, and evaluation data.
2. Identify the intended user outcome and the source that can observe it.
3. List domain assumptions that could change the correct behavior.

## Execute

1. Write `task.md` with states, observations, action types, reset behavior, and episode endings.
2. Distinguish termination from truncation and define the final observation.
3. Define permissions, protected state, allowed side effects, valid alternatives, and unavailable evidence.
4. Specify the reward, independent outcome checks, metric denominators, and failure conditions.
5. Choose the named simple baseline and the existing maintained environment or trainer interface.
6. Write the data grouping, reserved families, seeds, budget, and stopping rule before training.
7. Turn accepted success and failure rules into executable tests or a test plan tied to concrete interfaces.
8. Resolve missing domain intent before implementing dependent behavior. Continue independent specification work.

## Verify

1. Trace each metric to an observable source and each action to a supported interface.
2. Exercise existing tests or a small control when the interface already runs.
3. Keep ambiguous outcomes explicit. Do not invent the user's domain policy.

## Deliver

- task.md: behavior, authority, observation, action, and reward specification.
- experiment.md: frozen baselines, splits, metrics, and budget.
- controls.md: known valid, invalid, partial, and unavailable-evidence cases.

## Capability boundary

This workflow authors the task in the actual project. A specification alone does not establish environment conformance or learning.
