# Inspect saved runs

Use the saved run list to inspect a project's local workflow records:

```sh
avalon agent runs --project ./my-project
avalon agent runs --project ./my-project --limit 100
```

The command reads `.avalon/runs`. It does not create the directory, acquire a state lock, or change a record.

The default limit is 20 returned entries. The command accepts limits from 1 through 100.
It scans at most 10,000 directory entries. It rejects a directory that exceeds this limit.

The list places runs with readable manifests first, in descending creation order.
It sorts equal creation times by the run identifier. Entries with unreadable manifests follow those runs.
The `total` field counts all directory entries. The `hasMore` field reports whether the limit omits entries.

The command checks the complete record chain and each artifact for every returned run.
It does not check the record chains of omitted runs. Repeat the command after active write operations finish.

Each entry has an `integrity` field:

- `valid`: The manifest, events, result, and artifact checks complete.
- `invalid`: A record is missing, malformed, or inaccessible. A symbolic link also produces this state.
- `tampered`: A record identity, chain link, event sequence, result reference, or artifact digest does not match.

The `tampered` state identifies a mismatch. It does not establish who changes the record or why.
Invalid entries report `status: "unavailable"`. They do not prevent the command from inspecting other entries.

Valid entries retain their recorded status. Their `drift` field describes the current project separately:

- `unchanged`: The current metadata and declared inputs match the saved bindings.
- `changed`: The current files differ from the saved bindings.
- `unavailable`: A current binding cannot be checked.

Metadata changes do not invalidate a historical result. The resume command still requires an explicit decision before it accepts project drift.
An artifact mismatch remains an integrity failure, because a saved evidence record binds the artifact bytes.

The command rejects symbolic links in the state path. It isolates a symbolic link within the run directory as an invalid entry.
Reports contain private goals, summaries, and paths. Artifact hashes establish byte identity. They do not establish scientific success.
