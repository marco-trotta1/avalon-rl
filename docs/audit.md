# Snapshot audit

Parse unknown input with `parseSnapshot` or `parseSnapshotText` before the audit.
Call `auditSnapshots({ source, target, policy? })` with the parsed snapshots.
The audit joins episodes by ID and transitions by index.
It compares observations, actions, rewards, next observations, and both ending signals.
It also compares the optional bootstrap mask.
Missing source episodes and transitions fail the audit.

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
