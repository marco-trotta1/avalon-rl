<p align="center">
  <img src="docs/assets/avalon-manga.png" width="1040" alt="Avalon RL. A human and an android face each other across glass.">
</p>

<h1 align="center">Avalon Replay: build project environments and verify improvements.</h1>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#use-it-with-your-agent">Commands</a> ·
  <a href="#evidence-and-limits">Evidence</a>
</p>

Avalon Replay turns a project goal and its authorized context into a frozen benchmark through your coding agent.
Preserve the current policy, capture its baseline, and evaluate changes against the same world and checks.
The agent authors the project. The runtime executes the explicit manifest and keeps the evidence local.

## Freeze a project benchmark

Ask your coding agent:

```text
Use Avalon Replay to build an environment from this goal and the authorized project context.
State assumptions, define observable success, preserve the current policy, and explain the evaluation split.
Create avalon-project.json, freeze its benchmark and baseline, then iterate on development cases.
```

Once the agent creates `avalon-project.json`, run:

```sh
avalon-replay freeze
avalon-replay develop --candidate repair=policy.py
avalon-replay compare --candidate selected=policy.py
```

The default benchmark directory is `.avalon/benchmark`.
`freeze` captures the baseline in one command and reuses the saved receipt when the project is unchanged.
Development uses development cases. Final comparison uses the frozen holdout cases.
The [project workflow](docs/replay/project-workflow.md) explains authoring, permissions, identities, and evaluation limits.

## Run the authored demonstration

Use Python 3.13 or later, the [Python dependencies](docs/python-lab.md), and Docker from a source checkout:

```sh
docker pull python:3.11.15-slim
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli project-demo --output /tmp/replay-project
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli freeze \
  --project /tmp/replay-project/avalon-project.json --output /tmp/replay-benchmark
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli develop \
  --benchmark /tmp/replay-benchmark --candidate repair=/tmp/replay-project/candidate.py
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli compare \
  --benchmark /tmp/replay-benchmark --candidate selected=/tmp/replay-project/candidate.py
```

This authored resource allocation task demonstrates the workflow. It does not train a model or establish production improvement.
The current project interface requires an executable Python policy and world with JSON observations and actions.
Recorded traces alone cannot supply missing world transitions or evaluate new decisions.
External service connectors are not implemented by the generic project format.

Replay also supports [games and simulated control](docs/replay/general-environments.md) and [Python function tasks](docs/replay/README.md).
It provides a CLI and Python API. Standard RL training remains available through the existing workflows.
The local open source runtime requires no hosted account.
Private domain tasks and managed services are possible offerings with explicit permissions and separate agreements.
These options do not establish buyer demand, contributor earnings, or Avalon revenue.

## Install

Use Node.js 22.12 or later and npm. Run this command in your project directory:

```sh
npx --yes https://github.com/marco-trotta1/avalon-rl/releases/latest/download/avalon.tgz install codex
```

Replace `codex` with `claude` or `cursor` for another agent.
Add `--dry-run` to preview the installation or `--project PATH` to select a project.
The installer uses a project runtime and preserves customized skills.

## Use it with your agent

Claude Code and Cursor use slash commands. In Codex, open `/skills` or use names such as `$rl-break`.

```text
/avalon Build and freeze a benchmark from this project goal and authorized context
/rl-env Build an environment for this task
/rl-break Find a rewarded failure in this environment
/rl-train Compare the original and revised rewards
```

Your coding agent supplies the model and tools. It follows the host's permissions and budget.
See all [23 workflows](docs/agent-commands.md) for inputs, outputs, and execution limits.

<details>
<summary>Run a local demo without a model</summary>

Run these commands from a directory that does not contain an `avalon-rl` folder:

```sh
git clone https://github.com/marco-trotta1/avalon-rl.git
cd avalon-rl
npm ci --ignore-scripts
npm run build
node dist/cli.js world-run --data examples/world/claim-plan.json
```

The demo exposes a false completion claim in a synthetic invoice task.
It makes no model calls.

</details>

## Guides

To start a trial with an external team, use the [team trial guide](docs/team-trial.md).
It includes a SQLite execution adapter, agent interface, fresh-reset replay, task export, and private intake worksheet.

```sh
node dist/cli.js trial init --out /tmp/avalon-team-workspace
node dist/cli.js trial run --data /tmp/avalon-team-workspace/session.json --out /tmp/avalon-team-run
```

Build the CLI first. The reference requires Python 3.11 or later.
The run returns code 5 because its missing-evidence control remains unknown.
The default agent is deterministic. An optional wrapper supports pinned local Ollama weights.

| Task | Guide |
| --- | --- |
| Build and freeze a project benchmark | [Project workflow](docs/replay/project-workflow.md) |
| Evaluate games and simulated control | [Environment adapters](docs/replay/general-environments.md) |
| Execute coding failures and evaluate repairs | [Avalon Replay](docs/replay/README.md) |
| Compare exact file snapshots | [Failure workflow](docs/failures.md) |
| Build tasks and test rewards | [World rules](docs/world.md) |
| Audit a data pipeline | [CLI reference](docs/cli.md) · [Snapshot format](docs/snapshots.md) |
| Train with Gymnasium or use Minari | [Python setup](docs/python-lab.md) |
| Use the SDK | [TypeScript SDK](docs/sdk.md) |
| Follow the experiments | [RL walkthrough](docs/learn-rl.md) |

## Evidence and limits

The published experiments use synthetic tasks.
They do not establish production detection rates or general training gains.
Read the [policy results](docs/wave2/results.md) and [pipeline results](experiments/python-counter-results.md) for baselines, costs, and negative findings.

Keep raw snapshots and witnesses private.
Read the [security guide](SECURITY.md) before sharing evidence.

[Contribute](CONTRIBUTING.md) · [MIT License](LICENSE)

