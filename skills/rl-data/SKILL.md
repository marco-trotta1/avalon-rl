---
name: rl-data
description: "Audit RL experience across collection, storage, conversion, and learner replay. Use for changed observations, rewards, masks, endings, context, or split overlap."
---

# /rl-data

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Locate the first evidenced data change and provide a reproducing witness.

## Discover

1. Trace the project's collection, serialization, conversion, and learner-loading code.
2. Find actual source, recorded, and learner artifacts from compatible runs.
3. Identify the supported export formats, transformation policy, numeric tolerance, and lineage evidence.

## Execute

1. Create or adapt the narrowest supported exporter when the project lacks an Avalon snapshot.
2. Validate the exporter with executed source controls before trusting it.
3. Run `avalon pipeline --source SOURCE --recorded RECORDED --target TARGET --lineage LINKS --out REPORT` when lineage exists.
4. Without lineage, run the comparisons and retain the inconclusive process claim.
5. Run `avalon contamination --source TRAIN --target EVAL --out OVERLAP` for exact cross-split overlap.
6. Use `avalon witness --source SOURCE --target TARGET --out WITNESS` for a reproducing mismatch.
7. For local Minari, use `avalon-python export-minari --dataset-path DATASET --task TASK --seed SEED --output SNAPSHOT`.
8. Compare observations, actions, rewards, end flags, final observations, masks, and task context.

## Verify

1. Inspect report findings and their exact input identities.
2. Replay the witness or the exporter control against the affected boundary.
3. Separate an allowed transformation from an unintended change.
4. Do not treat metadata hashes as proof that collection or training executed.

## Deliver

- pipeline.json and overlap.json: validated comparisons.
- witness.json: private exact evidence for the selected mismatch.
- Exporter source and tests when an adapter is added.

## Capability boundary

Avalon supports its snapshot schema and the executed Gymnasium/Minari path. A new trainer exporter needs its own executed preservation check.
