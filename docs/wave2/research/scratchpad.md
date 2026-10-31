# Avalon wave 2 scratchpad

Date: 2026-10-30.
Research state: two workers complete four iterations each.
Implementation state: three isolated lanes complete after the research decision and independent review.
Heartbeat: `avalon-research-and-release-loop`.

## Completed decisions

The trainer lane rejects generic configuration warnings as the main contribution.
TRL already merges support replay and the relevant configuration guard.
The lane selects a finite support mismatch that selected-token log probabilities do not expose.
The complete-support assertion detects the same mismatch.

The verifier lane rejects another task catalog as the main contribution.
It selects relational trace checks and a learned-policy experiment in the existing world.
Reward repair, mutation testing, relabeling, and adaptive curricula have established prior work.
Avalon makes no algorithmic novelty claim.

## Current queue

The old stack merges complete against their original bases.
The existing release artifacts are published as v0.3.0.
The three implementation lanes and command integration are merged after hosted checks.
The frozen comparisons and independent reviews complete.

1. Merge the final measured release PR after its hosted check.
2. Verify the exact merged head and both installed package artifacts.
3. Publish v0.4.0 with its checksums, measured evidence, and verification receipt.
4. Pause the heartbeat after release verification completes.

The GitHub release receipt records publication separately from this prepublication research snapshot.

## Open evidence

No actual trainer exports the proposed sampling receipt yet.
No independent user workflow or customer value is established.
The dense categorical assertion matches all 76 sampling case verdicts.
The disagreement schedule shows no gain under the history reward.
The task-family holdout exposes a transfer failure.
The [measured results](../results.md) preserve these outcomes and their limits.

## Operating rules

Select one unresolved lead per iteration.
Read its primary evidence before recording a claim.
Preserve a failed experiment and its seed.
Update this queue after a material result.
Keep private research and raw user evidence outside Git.
Pause the heartbeat when the authorized wave and release verification complete.
