# Pipeline audit

Call `auditPipeline({ snapshots, policy?, lineage? })` with snapshots in pipeline order.
The function accepts two or more parsed snapshots.
Complete stage coverage starts at source, includes recorded, and ends at learner.
Incomplete stage coverage makes the report inconclusive.
Stages can repeat, but cannot move backwards.

The audit compares each adjacent pair and each later snapshot against the original source.
The source comparison detects numeric drift that accumulates across individually tolerated edges.
The report identifies the first failing edge with one-based snapshot positions.
The edge fields `from` and `to` and the finding field `snapshot` use this same convention.
A source invariant failure can make the first edge fail.
The first edge does not establish the cause of a defect.

Supply one lineage item per adjacent pair.
Each item has `parentSha256` and `childSha256` values from `contentHash(snapshot)`.
A mismatched link or link count fails the audit.
Missing lineage makes the report inconclusive.
All stages must preserve the seed.
A target cannot relabel user-supplied evidence as synthetic.
Hash links bind supplied artifacts but do not prove process execution or external provenance.

The report format is `avalon.pipeline-audit/v1`.
Nested comparison reports preserve the privacy rules from the snapshot audit.
Producer labels remain visible.
Keep producer labels free of private data.
