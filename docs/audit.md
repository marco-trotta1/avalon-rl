# Snapshot audit

Parse unknown input with `parseSnapshot` or `parseSnapshotText` before the audit.
Call `auditSnapshots({ source, target, policy? })` with the parsed snapshots.
The audit joins episodes by ID and transitions by index.
It compares observations, actions, rewards, next observations, and both ending signals.
The bootstrap mask uses `0` when termination is true and `1` otherwise.
Truncation does not disable bootstrapping.
Both ending signals can be true.
A learner can add a correctly derived mask.
A supplied mask must satisfy this rule at each stage.
Removing a supplied mask fails the audit.
A missing learner mask makes its bootstrap semantics inconclusive.
Source and recorded stages can omit the mask.
Missing and extra episodes or transitions fail the audit.
Duplicate episode keys and transition indices fail the audit.
The audit skips ambiguous matches.
Reordered episodes produce a warning because their keys still identify the same experience.
Reordered transitions fail because their sequence changes.

The report format is `avalon.audit/v1`.
Findings identify a source episode by its one-based position.
Findings include field hashes instead of raw values or episode IDs.
Snapshot hashes use SHA-256 and canonical JSON object keys.
Array order remains significant.
The report preserves the producer label from each supplied snapshot.
Keep producer labels free of private data.

The default absolute and relative tolerances are zero.
The numeric comparison uses `abs(source - target) <= absoluteTolerance + relativeTolerance * max(abs(source), abs(target))`.
This rule applies recursively to numeric observations, actions, and rewards.
The absolute tolerance covers values near zero.
The relative tolerance scales with the larger magnitude.
Object keys and nonnumeric values must match exactly.
Arrays retain their length and position.
The parser rejects nonfinite JSON numbers.
The policy rejects negative or nonfinite tolerances.
The audit compares supplied evidence only.
A passing report does not establish task success or external validity.

Each stage must preserve its internal sequence.
Adjacent indices must connect the previous next observation to the current observation.
The same numeric tolerance applies to this connection.
A transition after termination or truncation fails the audit.
Indices that decrease or repeat fail the audit.
A missing prefix, an index gap, or an open ending makes the evidence inconclusive.
The audit does not compare observations across a gap.
Identical corruption at both stages still fails these sequence checks.

The task label and the complete metadata object must match exactly for each episode.
Numeric tolerance does not apply to categorical metadata.
Missing metadata differs from an empty metadata object.
A missing metadata member differs from a member with a null value.
Metadata object key order does not affect the comparison.
The report includes context hashes without task labels, metadata keys, or metadata values.
