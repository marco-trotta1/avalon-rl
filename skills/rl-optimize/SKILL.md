---
name: rl-optimize
description: "Profile and improve measured RL resource use while preserving a frozen outcome requirement. Use for rollout, training, memory, latency, or compute bottlenecks."
---

# /rl-optimize

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Produce a measured resource change that satisfies the declared quality constraint.

## Discover

1. Read the actual workload, correctness checks, hardware, budget, and quality requirement.
2. Identify the named baseline and supported profiler.
3. Choose the sampling unit, repeated measurement method, and stopping rule before changing code.

## Execute

1. Measure the unchanged workload and preserve the raw baseline results.
2. Profile the run and identify the limiting component.
3. Change one justified component in the actual project.
4. Add a regression first when the change corrects a demonstrated bug.
5. Repeat the same workload with the same inputs, versions, hardware policy, and resource limits.
6. Use an interleaved measurement order when warmup or machine drift can affect the comparison.
7. Run frozen correctness and quality checks on the candidate.
8. Report latency, throughput, memory, compute cost, and outcome only where they are actually measured.
9. Keep attempts that lose performance or fail quality checks.

## Verify

1. Report before/after values, units, baseline, sample count, uncertainty, seeds, data, and library versions.
2. Check measurement equivalence and disclose cache or compilation effects.
3. Do not accept a resource improvement that fails the frozen quality requirement.

## Deliver

- A measured project patch and relevant tests.
- profile.md: limiter, method, hardware, and raw artifact paths.
- optimization.md: before/after measurements, quality results, costs, and uncertainty.

## Capability boundary

The host profiles the actual supported runtime. A timing from one demonstration does not establish a general speed improvement.
