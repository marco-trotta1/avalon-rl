# Avalon wave 2 scratchpad

Date: 2026-10-30.
Research state: two workers complete four iterations each.
Implementation state: three isolated lanes start after the research decision.
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

1. Complete the old stack merges against their original bases.
2. Publish and verify the existing CLI and Python release artifacts.
3. Freeze the new receipt and finite-MDP boundaries.
4. Implement the three lanes with separate tests and documentation.
5. Integrate the commands and run the frozen comparisons.
6. Review each PR, retain negative results, merge, and verify the release artifacts.

## Open evidence

No actual trainer exports the proposed sampling receipt yet.
No independent user workflow or customer value is established.
The support assertion may match every diagnostic result.
The disagreement schedule may tie or lose under the same budget.
The family holdout may expose a policy transfer failure.
These outcomes remain in the final report.

## Operating rules

Select one unresolved lead per iteration.
Read its primary evidence before recording a claim.
Preserve a failed experiment and its seed.
Update this queue after a material result.
Keep private research and raw user evidence outside Git.
Pause the heartbeat when the authorized wave and release verification complete.
