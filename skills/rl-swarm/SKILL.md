---
name: rl-swarm
description: "Construct RL candidates with bounded parallel agents, then select frozen candidates with Hoeffding intervals over independent bounded evaluation trials."
---

# /rl-swarm

Read [the workflow protocol](../_shared/workflow.md) as a reference.
Before performing its context or setup steps, read [the runtime and selection procedure](../_shared/selection.md).
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Build a bounded candidate set and report whether the declared selection evidence separates one candidate from all competitors.

Example: `/rl-swarm Compare three reward repairs against the current reward within the saved experiment budget`.

## Discover

1. Identify the task, candidate construction interface, verified evaluator, simple baseline, and saved resource budget.
2. Check that the score has known finite bounds and that the trial unit supports the declared sampling assumption.
3. Reserve final evaluation groups before constructing candidates.

## Execute

1. Set candidate, worker, interaction, time, and cost limits before delegation.
2. Assign each worker a distinct candidate directory or branch, an acceptance check, and a stopping rule.
3. Tell each worker that others share the codebase and that it must preserve their edits.
4. Use the configured host model and its permitted tools. Execute sequentially if delegation is unavailable.
5. Review candidate checks and retain every failed or stopped construction attempt.
6. Freeze candidate identities, the baseline, metric direction, improvement margin, score bounds, trial count, and error probability before collecting selection outcomes.
7. Execute the verified evaluator over the frozen selection trials. Keep final evaluation outcomes unavailable to construction workers.
8. Record all declared outcomes, failures, latency, compute cost, external inference cost, and unknown host cost.
9. Run `avalon select --plan PLAN --scores SCORES --out NEW_REPORT` once after the declared trials complete.
10. Preserve an inconclusive result. Do not convert agent agreement into evaluation samples or extend a completed fixed comparison.
11. Hand a separated frozen candidate to `/rl-eval` on the reserved final groups.

## Verify

1. Check source or checkpoint hashes, independent trial identities, bounded scores, complete denominators, and baseline coverage.
2. Inspect the actual selector output and worker artifacts. A completed worker does not prove candidate quality.
3. Report unsupported sampling assumptions, overlapping intervals, failed trials, and exhausted budgets as limits.

## Deliver

- swarm.md: ownership, resource limits, construction attempts, and stopping reasons.
- plan.json and scores.json: the frozen comparison and complete selection records.
- selection.json: the selector result, including an inconclusive result.
- result.md: evidence links, resource use, uncertainty, and final evaluation handoff.

## Capability boundary

The host delegates construction. The local selector performs arithmetic over supplied trial records and does not launch models or authenticate their outcomes.
