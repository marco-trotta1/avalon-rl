# Reproducible audit witnesses

A witness contains raw selected evidence.
Keep the witness private.
Publish the audit report only after you review its producer labels.

Call `buildWitness({ source, target, report, findingIndex? })` with the exact parsed snapshots that produced the report.
The default finding index is zero.
The function rejects stale snapshot hashes, an absent finding, or a finding that does not reproduce.
The report format is `avalon.audit-witness/v1`.
The privacy label is `private-evidence`.

The function removes episodes and transitions while the selected finding still reproduces.
It keeps original transition indices and all selected field values.
It records the original source and target episode positions.
It preserves the selected code, severity, field, step, hashes, and both episode identities.
It maps `episode` through the source positions and `targetEpisode` through the target positions.
A repeated failure on another target episode cannot replace the selected failure.
For an older report without target positions, it restores the selected position from a fresh audit at the same finding index.
It does not change the input snapshots.

The reduction uses the report policy and makes at most 64 removal checks.
The result records the check count and whether it reaches this limit.
The reduction is deterministic but does not prove a global minimum.
Removed context can introduce unknown prefix, gap, or ending findings.
These new findings do not replace the selected finding.

Re-audit the witness source and target with `auditSnapshots` and the witness report policy.
The witness report must match this fresh report.
The original snapshot hashes bind the witness to its supplied inputs.
They do not prove external provenance.
