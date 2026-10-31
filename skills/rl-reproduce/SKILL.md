---
name: rl-reproduce
description: "Restore recorded RL source, dependencies, data, settings, and seeds, then rerun the declared result and report drift."
---

# /rl-reproduce

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Establish whether the recorded method can be rerun within its declared numerical limits.

## Discover

1. Read the original experiment manifest, source identity, dependency versions, data hashes, seeds, and resource needs.
2. Check artifact availability before creating an isolated environment.
3. Identify whether the original method expects exact replay or numerical tolerance.

## Execute

1. Create an isolated working directory or environment within the authorized project scope.
2. Resolve the recorded source and dependencies without replacing unrelated user state.
3. Verify data and checkpoint hashes before execution.
4. Rerun the exact declared method with the original seeds and settings.
5. For built-in training, reconstruct `gym-train` settings from training.json and evaluate the new checkpoint on the recorded reserved seeds.
6. Compare policy, trajectory, and metric artifacts under the declared reproducibility contract.
7. Record hardware, library, missing-data, and unavailable-source differences.
8. Preserve the new outputs separately from the original run.

## Verify

1. Check exact identities where deterministic replay applies.
2. Use the declared numeric tolerance where hardware or arithmetic can vary.
3. Do not silently choose a new dataset or dependency version to obtain a pass.
4. Report a failed reproduction or missing artifact as a result.

## Deliver

- reproduction.md: original and rerun identities, commands, and environment.
- comparison.json: exact or numerical differences.
- The new private run artifacts and unresolved restoration gaps.

## Capability boundary

Hashes and manifests support restoration. GPU byte identity and unavailable external artifacts require explicit limits.
