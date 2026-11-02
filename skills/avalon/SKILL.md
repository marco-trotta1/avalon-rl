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

## Execute a failure with Avalon Replay

Use episode tasks for games and simulated control with host-owned observations, actions, rewards, and episode boundaries.
Use function tasks for Python functions with JSON inputs and outputs.
The CLI supports the installed built-in worlds. Other worlds require a trusted adapter through the Python API.
Use `avalon-replay --help` or the current source module `avalon_lab.replay_cli`.
The standalone command requires Python and Docker. Do not silently run candidate code on the host.

1. Preserve the failure, a reference solution, and the owner's expected behavior.
2. Declare development and holdout inputs or episode seeds before constructing the repair.
3. Include a legitimate alternative and a negative control. Keep expected values outside candidate access.
4. Validate the task, then run the observed code, reference, controls, and repair in the same campaign.
5. Review the private HTML and JSON reports. Keep failed, skipped, and inconclusive cases visible.
6. Use the one-step coding environment only for development rewards. Evaluate frozen policies on separate holdout episodes or inputs.
7. State the supported task class, container boundary, grader limitations, and unmeasured costs.

Read `docs/replay/general-environments.md` before using episode tasks or adding a trusted environment adapter.
The policy returns actions. Keep reward calculation and termination in the trusted host environment.
Preserve standard RL training workflows. Replay evaluates supplied policies and does not replace a learning algorithm.
Do not claim universal environment integration from the generic adapter interface.
Do not claim a model was trained when only supplied code was evaluated.
Do not publish task data, infer licensing rights, or promise contributor earnings from a passing report.

## Capture a user failure

Use the local `failure` workflow when the user supplies an agent failure with relevant files.
Check `avalon failure --help` first. Older runtimes can lack this command.
Build the current Avalon source when the installed runtime does not support the command.

1. Preserve the initial files, observed files, expected behavior, model identity, and capture time.
2. Keep the case private. Never infer permission to share it from possession of the files.
3. Propose a reference result and explicit checks. Ask the owner to review their intended meaning.
4. Run `failure capture`, then `failure replay`. Keep unresolved results visible.
5. Create a fresh directory with `failure environment`. Keep the case and reference outside candidate access.
6. Use the host's authorized tools to repair the task. Stop the candidate before grading.
7. Run `failure grade`. Retain failed checks and evaluate separate families before claiming broader improvement.
8. Use `failure package` only with explicit permitted uses and a completed review bound to the case hash.

Exact file checks can reject equivalent solutions. Do not claim behavioral equivalence from these checks.
The task directory is not a security sandbox. Use an isolated container for untrusted execution.
Package preparation does not publish data, execute payments, or establish model improvement.

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
