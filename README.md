# Avalon RL

**Build learning worlds. Challenge rewards. Keep the evidence.**

Avalon is a local CLI and SDK for people who build environments and data pipelines for agents.
It compares what an environment emits with what a learner receives.
It also finds synthetic cases where a verifier rewards the wrong outcome.

The project uses the [MIT License](LICENSE).
It has no UI, site, server, telemetry, or model API client.

## Start with a counterexample

Use Node.js 22.12 or later.

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js world-demo
node dist/cli.js lab-demo --fault collapsed-ending
node dist/cli.js lab-demo --fault none
```

The world demonstration gives a completion claim a weak reward.
An independent state check rejects the same action sequence.
The data demonstration changes an episode ending before the learner receives it.
The clean control preserves the original experience.
All three examples use synthetic data.

## What works

| Capability | Result |
| --- | --- |
| Experience audit | Compare observations, actions, rewards, final observations, ending signals, masks, and task context |
| Pipeline audit | Compare adjacent stages and locate the first divergence from the source |
| Private witness | Reduce evidence while preserving a selected finding and its episode identity |
| Split inspection | Find exact episode or transition overlap across declared splits |
| Operations world | Reset, act, replay, and evaluate synthetic invoices and tickets |
| Verifier challenge | Compare a weak reward with explicit outcome, authority, and side-effect checks |
| Bounded search | Keep counterexamples and report the unexplored action space |
| Curriculum | Select tasks from recorded outcomes with a finite budget |
| Python integration | Execute Gymnasium, a real Minari HDF5 roundtrip, and NumPy TD updates |
| Portable reports | Write JSON, Markdown, and SARIF without uploading the inputs |

The [RL walkthrough](docs/learn-rl.md) explains these capabilities through runnable experiments.
The [strategy](docs/strategy.md) connects the public laboratory to a possible specialist agency.

## Audit your pipeline

```sh
node dist/cli.js audit --source source.json --target learner.json --out audit.json
node dist/cli.js report --data audit.json --format markdown --out audit.md
node dist/cli.js witness --source source.json --target learner.json --out witness.json
node dist/cli.js pipeline --source source.json --recorded recorded.json --target learner.json
```

Use the [snapshot format](docs/snapshots.md) to export a pipeline boundary.
Audit exit codes are `0` for pass, `4` for fail, and `5` for inconclusive.
The pipeline remains inconclusive without explicit artifact links.
Hash links bind supplied artifacts. They do not prove process execution or provenance.

Witnesses contain raw selected evidence. Keep them private.
The CLI requires a new owner-only output file for a witness.
Ordinary reports omit raw observations and actions, but retain fingerprints and producer labels.
See the [command reference](docs/cli.md) and [security boundary](SECURITY.md).

## Run the real Python experiment

Use Python 3.13 or later.
The tested dependencies include CPU JAX for Minari's space handling.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements-tested.txt
.venv/bin/python -m pip install --no-deps ./python
.venv/bin/avalon-python experiment --seed 7 --output /tmp/avalon-experiment
.venv/bin/avalon-python compare --experiment /tmp/avalon-experiment --avalon-cli "$PWD/dist/cli.js" --output /tmp/avalon-comparison
```

Select new output directories for each run.
The experiment records source, recorded, and learner snapshots with versions and hashes.
The comparison includes a structural baseline and a simple exact assertion.
The [Python guide](docs/python-lab.md) covers built-in recording and local Minari export.

## Test a learning world

```sh
node dist/cli.js world-challenge
node dist/cli.js world-search --budget 1000 --depth 3
node dist/cli.js world-benchmark --repetitions 25
node dist/cli.js world-curriculum --budget 8
node dist/cli.js world-run --data examples/world/claim-only.json
```

World actions change synthetic local records only.
The world curriculum uses a known-good script. It does not train a model.
The search covers its declared action alphabet and depth.
The [world contract](docs/world.md) states the rules and limits.

## Evidence and limits

The executed counter pipeline preserves its source transitions through real Minari storage.
Avalon detects all 10 injected views from five selected fault families.
The simple exact assertion detects the same 10 views.
Both methods produce 0 false alarms on the 2 clean views.
This result establishes no detection-count advantage over that assertion.
It does not estimate a production detection rate or training improvement.

The [experiment report](experiments/python-counter-results.md) records the method and negative result.
The [release evidence](docs/releases/2026-10-30/evidence.json) records versions, hashes, latency, costs, and limits.
The [PR ledger](docs/releases/2026-10-30/pr-ledger.md) maps the work to individual contributions.
No native Gymnasium or Minari transition defect is established by these experiments.

## Use the SDK

```ts
import { parseSnapshot, auditSnapshots } from "avalon-rl";

const source = parseSnapshot(sourceObject);
const target = parseSnapshot(targetObject);
const report = auditSnapshots({ source, target });
```

The [SDK guide](docs/sdk.md) covers local package installation and type declarations.
The original [inspection and appraisal commands](docs/appraisal.md) remain available.
Appraisal requires documented comparable transactions. Synthetic prices remain explicitly invented.

## Contribute

Add one adapter, controlled fault, task family, or independent verifier with a reproducible check.
Start with the [contributor guide](CONTRIBUTING.md).

```sh
npm run test:audit
npm run test:lab
npm run typecheck
npm run check:privacy
```

Run the full suites before a commit or PR.
The [validation workflow](docs/ci.md) checks the Node and Python boundary on GitHub.
