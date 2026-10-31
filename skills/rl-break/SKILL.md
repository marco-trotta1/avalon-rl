---
name: rl-break
description: "Find replayable reward exploits, false accepts, false rejects, and side effects in authorized RL environments or supplied traces."
---

# /rl-break

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Find and reproduce a concrete disagreement between reward and the declared task outcome.

## Discover

1. Read the task, grader, available action space, valid controls, source revision, and search budget.
2. Choose the authorized local environment or supplied trace set.
3. Identify independent outcome checks before searching for exploits.

## Execute

1. Freeze the action alphabet, search depth, seed set, and stopping rule.
2. Try completion-only claims, history violations, frame violations, missing evidence, and valid alternative solutions.
3. Use separate search workers for distinct failure mechanisms when the host supports agents.
4. For the finite world, run `avalon world-search --seed SEED --budget BUDGET --depth DEPTH --out REPORT`.
5. For supplied traces, use `avalon trace-audit` and `avalon trace-witness` with the declared contract.
6. Reduce a discovered case while preserving its observed disagreement.
7. Replay the reduced case against the exact grader and independent outcome check.
8. Preserve failed search arms and the remaining unexplored scope.

## Verify

1. Require an executed replay for each confirmed failure.
2. Distinguish an exploit from a valid alternative that the grader rejects.
3. Do not claim absence of exploits from a bounded unsuccessful search.

## Deliver

- counterexample.json: the exact replay inputs and expected disagreement.
- search.md: scope, budget, mechanisms, unsuccessful arms, and remaining gaps.
- replay output: observed reward and independent task outcome.

## Capability boundary

The built-in search is finite and synthetic. External environment exploits require a validated project runner and the same replay gate.
