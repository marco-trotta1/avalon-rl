# Sampling forensics

Avalon reads inert sampling receipts from local JSON files.
It does not import a trainer or execute a model.
The format is `avalon.sampling/v1`.

A receipt contains the producer name, version, revision, context SHA-256 hash, and token rows.
Each row identifies the sample, group, position, sampled token, observed role, and observed loss mask.
The role is `policy`, `tool`, `context`, or `padding`.
The key is the sample ID and token position.
One sample belongs to one group within a receipt.

The selected log probability uses `{"kind":"known","value":-0.5}`.
The support uses `{"kind":"captured","token_ids":[0,1]}`.
The raw logits use `{"kind":"known","values":[0,0,0]}`.
Unavailable evidence uses `{"kind":"unavailable","reason":"The producer does not export this evidence."}`.
The ordered processor list contains `name`, `value`, and `token_ids` for each step.
An empty processor list declares that no processor runs.

The parser rejects duplicate fields, duplicate token keys, duplicate support IDs, non-finite values, and integers that lose JSON precision.
The file reader accepts regular files of at most 4 MiB.
It rejects symbolic links and named pipes.
The limits are 4096 token rows, 4096 vocabulary entries per row, and 131072 total logit values.

Receipts can contain sensitive model evidence.
Keep user receipts outside Git.
The public examples contain synthetic data only.
Hashes bind supplied content. They do not prove that a trainer executes the recorded steps.
