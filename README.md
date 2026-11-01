# Avalon RL

**Build learning worlds. Challenge rewards. Run RL workflows from your agent.**

Avalon supplies agent workflows, a local CLI, and an SDK for RL projects.
It compares what an environment emits with what a learner receives.
It also finds synthetic cases where a verifier rewards the wrong outcome.

The project uses the [MIT License](LICENSE).
The runtime has no UI, site, server, telemetry, or model API client.
The commands use your coding agent's model and tools.

## Install the agent commands

Use Node.js 22.12 or later and npm.
Build this source version and install its workflows into your project:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js install codex --project /path/to/project
```

To install the latest published version, run this command from your project directory:

```sh
npx --yes https://github.com/marco-trotta1/avalon-rl/releases/latest/download/avalon.tgz install codex
```

Replace `codex` with `claude` or `cursor` for another host.
This source version includes 23 workflows and a private project runtime. No global npm installation is required.
The public download follows the latest published release and can contain fewer workflows until this source version is released.
The runtime works after the original npm cache is removed.
Use `--dry-run` to preview the installation or `--project PATH` to select another directory.
Untouched 0.5 and 0.6 protocols upgrade automatically with retained backups. Modified skills remain protected.
Cursor and Claude project skills use `/rl-train`, `/rl-break`, and the other command names.
Codex exposes the skills through `/skills` and `$rl-train`.
Native Claude plugins use the `avalon` namespace.

```text
/avalon Find why reward rises while held-out task completion falls
/rl-break Find a rewarded failure in this environment
/rl-train Compare the current reward with the repaired reward
/rl-swarm Compare frozen candidates with bounded evaluation evidence
/rl-sweep Run the declared settings and seeds within the saved budget
/rl-status Show recent runs and their next valid action
```

The [command guide](docs/agent-commands.md) describes all 23 workflows and their execution boundaries.
Each workflow discovers project inputs and leaves private records under `.avalon`.
Claude and Cursor also support the native marketplace catalogs described in the guide.
The host performs code changes, execution, research, and delegation under its existing permissions and budget.
Unsupported trainers require an implemented and tested adapter before their results can be verified.

All workflows prefer the installed `0.7.0` runtime. The original workflows can use `0.6.0` when the newer runtime is absent.
The new workflows require `0.7.0`. Existing runtime files and customized skills remain protected during installation.
The [runtime procedure](skills/_shared/selection.md) explains local package setup and the current release boundary.

Candidate selection uses declared independent bounded trials and a fixed Hoeffding comparison.
Shared-context agent votes do not supply those trials. Overlapping intervals remain inconclusive.
See the [selection guide](docs/selection.md) for the executable format and statistical assumptions.

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
| Agent workflows | Install 23 processes for research, environment work, reward repair, experiments, swarms, status inspection, and releases |
| Private run records | Bind inputs, retain artifact evidence, inspect drift, and preserve completed results |
| Gymnasium learning | Train a bounded CartPole policy, evaluate frozen checkpoints, and audit actual probabilities and learning credit |
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
| Sampling forensics | Compare token support, full finite distributions, masks, correction weights, and categorical gradient witnesses |
| Trace contracts | Check final outcomes, preserved values, action authority, paired renaming, and declared holdouts |
| Actual policy learning | Compare three reward rules and three schedules with real CPU Q updates and frozen evaluation |

The [RL walkthrough](docs/learn-rl.md) explains these capabilities through runnable experiments.
The [strategy](docs/strategy.md) connects the public laboratory to a possible specialist agency.

## Run the research loop

```sh
node dist/cli.js trace-benchmark --seed 7 --repetitions 5
avalon-python sampling-benchmark --seed 7 --output /tmp/avalon-sampling-benchmark.json
python examples/policy/diagnose.py --avalon-cli "$PWD/dist/cli.js" --output /tmp/avalon-diagnosis
```

Install the Python package before running its commands.
Choose new output paths for each run.
The diagnosis example freezes a contract, trains a real policy, and explains a rewarded unauthorized action history.
It executes an explicitly supplied trusted local CLI.

The finite probability example exposes equal selected-token probabilities with different supports and different categorical gradients.
The complete categorical assertion detects the same mismatch.
The sampling benchmark agrees with that assertion on all 76 synthetic cases, including 16 unknown cases.
Neither method raises a false alarm on the 24 clean controls.
These are exact fixture counts. They do not estimate production detection rates.
Observed sampling latency, costs, versions, and limits are in the [release evidence](docs/wave2/evidence.json).

The frozen policy experiment executes 180 runs and 432,000 Q updates across 20 paired learner seeds.
History-aware rewards achieve 160 of 160 valid completions on new invoice seeds.
Final-state rewards achieve 140 of 160 under the same fixed schedule and interaction budget.
The paired difference is 12.5 percentage points. The seed-cluster bootstrap interval is 5.0 to 22.5 points.
The interval conditions on the fixed synthetic task suite.
The final CLI run takes 21.264 seconds, measured once. API fees are 0 USD; local compute remains unpriced.

Disagreement scheduling shows no gain over the fixed and random schedules under the history reward.
Every condition matches random actions at 15 of 160 valid held-out ticket-family episodes.
The experiment establishes no family transfer, algorithmic novelty, or production policy improvement.
The [results](docs/wave2/results.md) preserve all baselines, negative results, and reproducibility limits.

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
node dist/cli.js world-run --data examples/world/claim-plan.json
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
