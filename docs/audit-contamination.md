# Content overlap audit

Call `auditContamination({ splits })` with named splits and parsed snapshots.
The report format is `avalon.contamination/v1`.
The report uses split and episode ordinals.
It hashes split names and snapshot content.
It does not include episode IDs, raw transitions, or split names.

The audit fingerprints episodes and individual transitions with SHA-256.
The fingerprint includes observations, actions, rewards, and both ending signals.
It excludes episode IDs, task labels, metadata, transition indices, and derived bootstrap masks.
These exclusions prevent renamed labels from hiding copied experience.
Episode fingerprints preserve transition order.
The comparison is exact and does not apply numeric tolerance.

Repeated content within a split produces a warning.
Repeated content across splits fails the audit.
A single split makes cross-split evidence inconclusive.
Exact overlap does not prove a causal leak.
Distinct content does not prove independent sites, years, or sources.
Split by site and year when those keys define independence.
Keep each original snapshot private.
