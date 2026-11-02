# First team trial

Test this question: Does Avalon help a team reproduce an agent failure and maintain a useful regression test?
The trial does not promise better training or better detection than ordinary assertions.
Keep the trial local. Do not send team records to a model or upload them without separate authorization.

## Find the first workflow

Select a team with an observed failure, an engineering owner, and a disposable test environment.
Start with one workflow that changes structured records, such as a refund or ticket update.
Ask the team to supply a failed run and a successful run.
Exclude workflows whose outcomes cannot be independently observed.

Use this invitation as a draft. Send it yourself.

> We are testing Avalon with one team whose AI agent reports success when a task remains incomplete.
> We will help reproduce one failure and deliver a local regression test.
> Your team keeps control of the data and reviews the success criteria.
> Could we discuss a failure you already observe?

## Agree on the scope

Copy [the trial worksheet](team-trial-worksheet.md) into a private directory outside the repository.
Record the owner, permission reference, allowed records, retention period, and deletion process.
Set an engineering time budget and an execution budget before work starts.
Agree on a useful deliverable and a repeat-use checkpoint.
Do not request production credentials for this trial.

The manifest records authorization as a declaration. Avalon cannot verify that declaration.

## Run the complete reference workflow

Install the repository dependencies and build the CLI:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js trial init --out /tmp/avalon-team-workspace
node dist/cli.js trial run --data /tmp/avalon-team-workspace/session.json --out /tmp/avalon-team-run
node dist/cli.js trial replay --bundle /tmp/avalon-team-run --out /tmp/avalon-team-replay
```

Install Python 3.11 or later for the reference adapter.
Project-local agent installations include the same trial templates.
Use their recorded `.avalon/runtime/VERSION/dist/cli.js` entrypoint when no global CLI is installed.
Select new output directories for each command. The commands never replace existing directories.
Run returns code 5 because one control lacks evidence. Replay returns code 0 when every captured execution matches.
Do not chain these commands with `&&` when an expected unknown produces code 5.

The workflow executes real SQLite commits against fictional records.
It covers false completion, a restored unauthorized write, a corrected refund, missing observation, and a deterministic agent.
Each case runs again from a fresh database with the captured actions.
The agent case uses a reserved task with a different initial balance and goal.
The reserved task has the same author and task family. It is not an independently authored customer holdout.

The output includes a frozen session, source hashes, request records, snapshots, database judgments, witnesses, and a readable review.
Open `review.md`, `collection.json`, and `report.json` in the output directory.
Raw process errors remain in private request records when execution fails.
Failed runs retain partial artifacts and have no completion manifest.

Warning: Adapter and agent processes run with your user permissions.
The reference database is isolated by directory. Avalon does not provide an operating system sandbox.
Use a container or restricted account for code that requires stronger isolation.

## Export a failure as a reusable task

```sh
node dist/cli.js trial export --bundle /tmp/avalon-team-run --case restored-write --out /tmp/avalon-restored-task
node dist/cli.js trial run --data /tmp/avalon-restored-task/session.json --out /tmp/avalon-restored-run
```

The export contains the adapter entry file, reset data, captured actions, outcome rules, and source provenance.
The reference export runs independently of the original workspace.
Custom adapters can require imported files or dependencies. Package those separately before moving the task.
Replace the scripted policy with an agent process to test a changed policy.
Keep the original package and freeze a new session before comparing results.

## Test a real local model

The workspace includes `ollama-agent.py` for the reference refund task.
It connects only to a loopback Ollama service and rejects remote models or changed weight digests.
It does not download models or call a paid provider.
Start Ollama with `OLLAMA_NO_CLOUD=1` and an already installed model.
Obtain the exact model name and digest from its local `/api/tags` response.
Replace the reference agent policy in a copy of `session.json`:

```json
{
  "kind": "agent",
  "process": { "executable": "python3", "script": "ollama-agent.py" },
  "config": { "model": "INSTALLED_MODEL", "digest": "FULL_SHA256_DIGEST", "port": 11434 }
}
```

Set `protocol.modelVersion` to the selected name and digest.
Set `limits.timeoutMs` to 60000 and `limits.maxOutputBytes` to 1048576.
Retain failed calls. Do not retry or change the prompt after inspecting results within the same frozen comparison.
The response records the model identity, request, response, runtime version, and reported local API fee.
Local API fees exclude compute, electricity, and engineering costs.
This is an inference test. It does not train a model.
The wrapper uses the documented Ollama [chat](https://docs.ollama.com/api/chat) and [model listing](https://docs.ollama.com/api/tags) endpoints.

## Connect the team's workflow

The session runner executes the process interface in [the adapter guide](trial-adapter.md).
Modify the reference adapter inside the team's sandbox, using its existing test tools.
Keep the same process interface and use this acceptance checklist:

1. Reset a disposable database from a versioned fixture.
2. Verify the initial state before each run.
3. Execute the team's agent with a fixed task, seed, model version, and budget.
4. Read the resulting state through a separate observer after each action.
5. Record the action, prior observation, next observation, reward, and both ending flags.
6. Record execution latency and cost, or mark them unknown.
7. Export one episode using [the snapshot format](snapshots.md).
8. Reset again and repeat the failed sequence.
9. Compare the observations and explain each difference.

Record unauthorized intermediate changes when the task forbids them.
An agent's completion message is not an independent observation.
Do not invent observations when logs lack the required records.
Mark missing evidence as unknown.
Use integer cents for money. Set documented tolerances for measured floating-point values.

The bundled `adapter.py` provides the fictional SQLite reference.
Adapt it to the team's disposable environment before processing team records.

## Prepare the manifest

Copy `examples/team-trial/trial.json` to the private directory and replace its fixtures.
Use a session manifest for fresh execution or a trial manifest for existing recorded evidence.
The input limit is 10 MiB and 100 cases.
Each case contains one snapshot episode, one Avalon contract, and one baseline contract.
The runner uses the existing [trace contracts](wave2/traces.md).

| Field | Required content |
| --- | --- |
| `authorization` | Owner, permission reference, and explicit local-use approval |
| `protocol` | Freeze time, reviewer, baseline name, data revision, adapter version, model version, setup minutes |
| `id` | Unique case identifier |
| `group` | Workflow source group, including related incidents and variants |
| `split` | `development` or `holdout` |
| `origin` | `observed` or `authored-control` |
| `expected` | Independently reviewed `match`, `mismatch`, or `unknown` |
| `labelEvidence` | Reference to the evidence supporting the expected result |
| `execution` | Measured `latencyMs` and `costUsd`, or `null` when either is unknown |
| `snapshot` | A snapshot with `user-supplied` evidence for observed cases |
| `contract` | The team's reviewed success and preservation rules |
| `baseline` | The team's existing simple check expressed as trace rules |

Keep related incidents in one split. For site data, separate sites and years where the intended claim requires both.
Have the team author holdout tasks independently. Freeze the protocol and rules before opening their results.
The runner detects declared group overlap. It cannot detect hidden overlap or prior exposure.
Use a separate immutable copy or version control to preserve the frozen private manifest.
Keep its hash with the report. A hash does not prove when a protocol was frozen.

## Review the report

```sh
node dist/cli.js trial --data /absolute/private/trial.json --out /absolute/private/report.json
```

The report contains private witness records. Output permissions allow access only to the owner.
Permissions do not prevent cloud backup or sharing by the owner.
The report separates observed cases, authored controls, development cases, and holdout cases.
It records disagreements, false accepts, false rejects, unknowns, hashes, and individual check timings.
The trial report compares rule sets through the same checker on the same observations.
The collection report also records the adapter's independent baseline implementation.
The reference adapter supplies a simple SQLite history assertion as that baseline.
The reference judgment and history assertion share the adapter. They are not independent human reviews.
Execution cost and latency come from the adapter. The runner does not independently measure those values.
Do not treat an empty holdout group as successful validation.

Exit codes: 0 means agreement with all supplied labels and no unknowns.
Code 4 means at least one Avalon verdict disagrees with its supplied label.
Code 5 means all labels agree but at least one result remains unknown.
Code 1 means an input or output error occurs.
An expected failure can therefore produce exit code 0. The trial audit tests the checker against labels.
The session command also returns code 4 when fresh-reset replay diverges.
Use `trace-audit` with a case snapshot and contract when CI must fail on an unsuccessful task outcome.

## Deliver and decide

Deliver the sandbox adapter, reset fixture, frozen manifest, report, and instructions to the team.
Ask the owner to reproduce the failure without your assistance.
Ask the owner to run the same check after a change to the agent.
Compare the total engineering time with the team's ordinary test approach.
Record negative results and unresolved unknowns.
Use the worksheet to decide whether another workflow warrants a trial.
Do not claim training improvement until a separate controlled training experiment measures it.
