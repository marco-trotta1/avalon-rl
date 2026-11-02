# Trial process adapter

The session runner starts one process for each request.
It passes one JSON object on standard input and expects one JSON object on standard output.
Use `executable` for a PATH command or absolute executable path. Use `script` for the entry file.
Relative script paths resolve against the session manifest directory.
Avalon passes the script as one argument without a shell.
The child inherits the current environment. Keep credentials out of manifests and request records.

Warning: The configured processes run with the current user's permissions.
The deadline and output limits are execution controls, not a security sandbox.
On Unix, a deadline kills the process group. Detached descendants can escape that group.
On Windows, the deadline terminates the direct child only.

## Session contract

Use `avalon trial init --out NEW_DIRECTORY` to obtain a complete manifest.
The format is `avalon.session/v1`.
It contains authorization, protocol metadata, an adapter process, execution limits, and cases.
Case identifiers contain letters, digits, underscores, and hyphens. They start with a letter or digit.
Each case supplies a task, seed, reset fixture, baseline contract, Avalon contract, and policy.
A scripted policy supplies actions. An agent policy supplies a process and optional JSON config.

Limits apply to one request or one case as follows:

| Limit | Scope |
| --- | --- |
| `maxSteps` | At most 100 actions per case |
| `timeoutMs` | At most 60000 milliseconds per process request |
| `maxOutputBytes` | At most 1048576 combined stdout and stderr bytes per request |
| `maxAgentCostUsd` | Maximum reported agent API cost per case |

The session permits at most 100 cases and 10 MiB of aggregate request and response JSON.
The JSON record limit excludes formatting overhead and database files.
The runner does not bound files written directly by an adapter or agent.
Configure provider limits in the agent wrapper. A completed provider charge cannot be reversed by Avalon.
Cost comparison uses a tolerance of 0.000000001 USD to accommodate floating-point addition.
The runner records a returned cost before rejecting an action that exceeds the budget.
It does not execute that action or retry the request.

## Environment requests

All requests contain `format: "avalon.adapter-request/v1"` and `operation`.
The `describe` operation requires no other fields.
Return a nonempty `name`, `version`, and `runtime` string.

Other operations contain an absolute `workspace`, the case's `reset` JSON, its `seed`, and its `task`.
The runner creates a new empty workspace for each execution.
Use only disposable state inside that workspace for the reference implementation.
Custom adapters must enforce their own account and environment boundaries.

| Operation | Response | Required behavior |
| --- | --- | --- |
| `reset` | `{ "reset": true }` | Create the case's initial state. Fail if existing state could be overwritten. |
| `observe` | `{ "observation": JSON }` | Read actual state independently from the actor's claims. |
| `step` | `{ "reward": NUMBER, "terminated": BOOLEAN, "truncated": BOOLEAN }` | Apply the request's `action` and commit its effects. |
| `judge` | `{ "status": VERDICT, "baseline": VERDICT, "baselineName": STRING, "evidence": JSON }` | Read independent outcome evidence and run a named simple baseline. |

A verdict is `match`, `mismatch`, or `unknown`.
Do not import Avalon verdicts into the adapter's judge operation.
The reference judge reads SQLite and its write journal. The Avalon checker reads the recorded observations and actions.
Missing evidence must remain unknown even when another private source knows the outcome.
The reference database is fictional and cannot establish an external payment.

The runner reads an observation after reset and after every committed action.
It preserves both ending flags. It adds truncation when a plan or step budget ends without termination.
The runner stops at termination or truncation. It never executes trailing scripted actions after an ending signal.
Captured action replay uses the same seed and reset fixture in a new workspace.
It compares initial observations, every transition, and the independent judgment.
Timings are excluded from equality. The report identifies the first differing transition.

## Agent requests

The agent receives these fields:

```text
format: avalon.agent-request/v1
task, seed, index, observation, history, config
remainingSteps, remainingCostUsd
```

Return `{ "action": JSON, "costUsd": NUMBER }`.
You can add `metadata` with JSON model identity, request details, or response details.
The environment adapter validates the action before execution.
The agent receives neither the workspace path nor the judge response through this protocol.
Processes still share user permissions, so this protocol does not enforce isolation from the filesystem.
For stronger independence, place the actor and observer in separate restricted environments.

The reference policy is deterministic Python. It is not a language model.
The optional Ollama policy uses installed local weights with a pinned digest.
For another provider, replace the agent wrapper and retain the same request and response format.
Do not print logs to stdout. Print diagnostics to stderr.
On failure, captured stdout and stderr are retained up to the request output limit.

## Evidence and replay

Run artifacts have owner-only file permissions and directory permissions.
These permissions do not prevent cloud backup or sharing by the owner.
The final manifest seals the listed reports, snapshots, contracts, source references, and execution receipts.
It excludes request logs and SQLite files. The report states that boundary.
Hashes detect changes to the listed artifacts. They do not authenticate the recorder.
Source hashes cover only adapter and agent entry files.
Record dependency locks, model digests, and external service versions separately.

Replay checks the manifest, current entry files, and adapter runtime description before executing captured actions.
It requires original source paths to remain available.
It makes no agent calls. It does not reproduce model sampling or historical latency.
Use task export to move the reference task to another directory.
Exports copy the adapter entry file and captured actions. Imported dependencies require separate packaging.

Synthetic sessions remain synthetic even when a real model supplies their actions.
The current collector labels scripted cases as authored controls.
It labels agent cases as observed only when the session declares user-supplied evidence.
These declarations do not replace the team's independent review.
