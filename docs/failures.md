# Turn an agent failure into a task

Avalon captures declared file snapshots, creates a fresh task directory, and grades a candidate against explicit checks.
The workflow runs locally without an account, model client, or upload.
This source feature requires a build that includes the `failure` command.
The published release can lag behind the source.

## Try the workflow

Keep the case and reference answers outside the candidate directory.
The task directory is not a security sandbox. Run untrusted agents in a separate container without credentials.
Stop the candidate before grading. Concurrent file changes can invalidate the result.

```sh
npm run build
node dist/cli.js failure demo --out failure.json
node dist/cli.js failure replay --data failure.json --out replay.json
node dist/cli.js failure environment --data failure.json --directory task-attempt-1
```

The authored failure repairs addition but changes a protected configuration.
The reference repairs addition and preserves that configuration.
The task directory contains only the initial files.
Give your agent the expected behavior and the task directory.
Keep the private checks and reference files outside the agent's access.

After the agent stops, grade its result:

```sh
node dist/cli.js failure grade --data failure.json --directory task-attempt-1 --out grade.json
```

A passing grade returns exit code `0`. A failing grade returns `4`.
Create another fresh directory for another attempt.
Avalon refuses to reset an existing directory or replace an existing report.
Reports use file mode `0600`. New task directories use mode `0700`.

## Capture your failure

Start with the [case format](failure-capture.md).
Replace the demo with the relevant initial files, observed files, and a reviewed reference.
Record the model, capture time, expected behavior, and failure family.
Use `source: "user"` for a real observation. Keep authored examples marked `synthetic`.
Keep the rights status `private` until the owner authorizes the specified use.

```sh
node dist/cli.js failure capture --data draft.json --out captured.json
node dist/cli.js failure replay --data captured.json --out replay.json
```

Capture validates supplied snapshots. It does not read a chat export or establish the accuracy of supplied provenance.
Replay requires a failing observed snapshot and a passing reference snapshot.
Other combinations remain unresolved.

The current checks compare exact file content or preserve an initial file.
Use these checks only when exact content defines success.
Equivalent implementations can fail an exact check. A person must review this limitation before accepting a package.
The grader reads declared initial paths and checked paths only.
It does not detect unlisted files, intermediate side effects, network activity, or model behavior.

## Compare a repair

Supply a JSON array of cases and an array of candidate records with `id` and `files`.
The [replay guide](failure-replay.md) describes the paired results and family split.

```sh
node dist/cli.js failure compare --data cases.json --candidates candidates.json --split split.json --out comparison.json
```

Freeze the candidate before evaluation. Assign related cases to the same family.
The split validator checks supplied family labels. It cannot identify incorrectly labeled or semantically duplicated cases.
Retain unresolved cases and regressions.
A comparison of captured cases does not establish generalization or a model training gain.

## Prepare a paid deliverable

The [licensing guide](failure-licensing.md) describes the export gates and review format.
A review binds the complete case hash, including its rights statement and checks.
Changing the case invalidates that review.

```sh
node dist/cli.js failure package --data authorized.json --use evaluation --review review.json --out package.json
```

A ready result contains the case, checks, reference answer, review, and replay evidence.
Treat it as private until the owner approves delivery to a specific buyer.
The secret scan covers selected token patterns. It cannot establish that a package contains no sensitive data.

Avalon records no sale, payment, buyer acceptance, or legal license agreement.
An authorized use field is an attestation. It does not establish ownership.

## Build sequence

| Change | Scope | Evidence required |
| --- | --- | --- |
| Capture | Typed private cases, bounded snapshots, stable content hashes | Invalid inputs fail; content changes invalidate hashes |
| Replay | Recorded checks, paired comparison, explicit family split | Observed failure and valid reference; retained unresolved cases |
| Licensing | Use restrictions, review binding, secret gate | Blocked cases expose reason codes without raw content |
| User workflow | CLI, fresh directories, candidate grading, guides | Local end-to-end tests with network access blocked |

Keep these changes in separate pull requests with meaningful implementation and verification commits.
Use merge commits to preserve their history.

## Next evidence gates

The following work remains outside this implementation:

1. Test capture with independent developers and authorized real failures.
2. Add a reviewed container runner with execution receipts and resource limits.
3. Add behavioral checks that accept legitimate alternative solutions.
4. Compare reconstruction effort with a manually written regression test.
5. Obtain buyer requirements and measure acceptance against those requirements.
6. Add payment processing after actual demand and contribution terms exist.
7. Test training adapters on frozen, unseen families before making improvement claims.

For a pilot, record review minutes, compute cost, execution latency, model versions, seeds, and task hashes.
Report the manual baseline and the uncertainty with each result.
This implementation supplies no evidence of buyer demand, revenue, or scientific novelty.
