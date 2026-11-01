# Agent commands

This source version provides 23 workflows for an existing coding agent.
The host model reasons, edits source, executes tools, and coordinates workers.
The local runtime discovers the project and records evidence.
The runtime does not call a model provider or execute the workflow by itself.

## Install

Use Node.js 22.12 or later and npm.
Build this source version, then install it into the selected project:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js install codex --project /path/to/project
```

To install the latest published version, run this command in your project directory:

```sh
npx --yes https://github.com/marco-trotta1/avalon-rl/releases/latest/download/avalon.tgz install codex
```

Replace `codex` with `claude` or `cursor` to select another host.
The public archive follows the latest published release. Unpublished source additions do not appear there until release.
The current directory is the default project. Add `--project PATH` to select another directory.
Use `--dry-run` to inspect the target files without writing them.
The installer copies all workflows, their shared protocol, and a self-contained Node runtime into the project.
It preserves identical files and refuses locally edited files.
The exact untouched 0.5 and 0.6 shared protocols upgrade automatically. Other differing files require inspection.
Stock upgrades retain the displaced file under `.avalon/install-backups` and return its backup path.
Detected concurrent edits stop an upgrade. The displaced content and any recreated target remain available for inspection.
It does not change user settings or install a model provider.

This source installer places its private runtime under `.avalon/runtime/0.7.0`, with its production dependency and licenses.
It works without a global `avalon` command and after the original npm cache is removed.
All workflows prefer that explicit Node entrypoint. A fresh source installation needs no older Node runtime.
The original workflows can select compatible `0.6.0` support when the newer runtime is absent.
The three new workflows require `0.7.0` through their shared runtime procedure.
Installation preserves the older runtime and retains a backup when it upgrades a reviewed stock protocol.
An existing global installation can also use `avalon install codex`.
The previous `avalon agent install --host HOST --project PATH` syntax remains supported.

The workflow prepares missing Python support in a project virtual environment within the existing setup authorization.
It uses the reviewed Python `0.4.0` wheel from release `v0.7.0` and checks its release manifest and checksum.
It installs declared dependencies there and uses the environment's explicit executable.
It preserves global Python and continues independent work if setup cannot complete.
See the [shared setup procedure](../skills/_shared/workflow.md#prepare-python-when-required) for the exact assets and verification steps.

The installer does not merge local skill edits or remove files that it does not own.
Inspect and preserve custom edits before explicitly replacing a conflicting file.

## Native plugin installation

Claude Code can register the repository and install its native plugin:

```sh
claude plugin marketplace add marco-trotta1/avalon-rl
claude plugin install avalon@avalon
```

These commands are verified with Claude Code 2.1.278. The resulting commands use the `avalon` namespace.
That CLI version does not accept an install `--marketplace` flag.
In Cursor, use Customize, From GitHub Repository, and select `marco-trotta1/avalon-rl`.
Then install Avalon from the imported catalog. The catalog passes the official schema; this UI path remains untested.
Use the project installer for Codex. Codex 0.133 rejects the root source used by these native catalogs.

Native plugins supply the skills. On first use, the shared protocol prepares the verified project runtime when needed.
It uses `avalon install --runtime-only` and adds no duplicate project skills.
Python support remains optional until a selected workflow needs it.

For `/rl-swarm`, `/rl-sweep`, and `/rl-status`, follow the [new runtime procedure](../skills/_shared/selection.md) after reading the original protocol.
These workflows prepare the pinned `v0.7.0` runtime when it is absent.
An inspected local `0.7.0` archive or built source package is also supported.

## Invoke

| Host | Project location | Invocation |
| --- | --- | --- |
| Cursor | `.cursor/skills/` | Type `/rl-data`, or select the skill from the slash menu. |
| Claude Code | `.claude/skills/` | Type `/rl-data`. |
| Codex | `.agents/skills/` | Use `/skills`, or mention `$rl-data`. |

The same pattern applies to every command below.
Claude plugin installation uses names such as `/avalon:rl-data` because plugins namespace their skills.
The project installer uses the shorter project skill names.
Do not install both forms in the same host unless that duplication is intended.

The package also contains `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json`, and a root `plugin.json`.
These manifests describe the bundled workflows.
Marketplace listing and a live host UI session are separate from package installation checks.

The host conventions follow the official [Cursor skills](https://cursor.com/docs/skills), [Claude skills](https://code.claude.com/docs/en/skills), and [Codex skills](https://developers.openai.com/codex/skills/) documentation.

## Command catalog

| Command | Work | Main artifact |
| --- | --- | --- |
| `/avalon` | Select and execute the workflows required by an RL goal. | A task graph and linked results. |
| `/rl-research` | Investigate primary sources, competing explanations, and falsifiers. | A research queue and tested hypotheses. |
| `/rl-spec` | Define task behavior, actions, authority, reward, and evaluation. | A task specification and experiment plan. |
| `/rl-env` | Build and exercise an environment or adapter in the project. | Executable source and conformance results. |
| `/rl-scenarios` | Generate valid cases, stress families, and reserved groups. | A generator, controls, and split manifest. |
| `/rl-reward` | Implement outcome rules and test their grading behavior. | Reward source, tests, and disagreements. |
| `/rl-break` | Search for rewarded failures and rejected valid solutions. | Replayable counterexamples and search limits. |
| `/rl-harden` | Repair a reproduced grader failure and preserve valid controls. | A patch, failing regression, and repair comparison. |
| `/rl-data` | Inspect experience across collection, storage, conversion, and replay. | The first changed boundary and a private witness. |
| `/rl-probs` | Compare actual sampling and learner probability evidence. | An audit, categorical witnesses, and unknown fields. |
| `/rl-credit` | Check returns, advantages, roles, masks, and groups. | A credit map and reproducing assignment errors. |
| `/rl-train` | Execute bounded training through a verified adapter. | A checkpoint, actual update receipts, and resource records. |
| `/rl-diagnose` | Test competing causes of a failing or misleading run. | A diagnosis, reproduction, and supported correction. |
| `/rl-ablate` | Isolate a component effect with paired conditions. | Effect estimates and the complete experiment ledger. |
| `/rl-curriculum` | Compare practice schedules under equal interaction budgets. | A scheduler and comparison against fixed and random practice. |
| `/rl-eval` | Evaluate frozen candidates against reserved cases and baselines. | Outcome, uncertainty, latency, and cost records. |
| `/rl-transfer` | Test frozen behavior under declared distribution shifts. | A transfer map and tested failure boundaries. |
| `/rl-optimize` | Change a measured resource limiter under a quality constraint. | A tested patch and before/after measurements. |
| `/rl-reproduce` | Restore and rerun the recorded method. | A reproduction receipt and result differences. |
| `/rl-release` | Review, package, install, and deliver the selected artifact. | A tested package, task or model card, and release receipt. |
| `/rl-swarm` | Construct bounded candidates and compare independent bounded trial outcomes. | Candidate identities, ownership, scores, and a Hoeffding selection report. |
| `/rl-sweep` | Execute a frozen experiment matrix across settings and seeds. | A complete ledger, checkpoints, development reports, and resource records. |
| `/rl-status` | Inspect saved runs, evidence, and binding drift. | A bounded run list and the next valid action. |

The detailed procedures live in the corresponding `skills/COMMAND/SKILL.md` files.
The installer copies the same procedures into the host's project directory.

## A session

Give the complete task to the coordinator:

```text
/avalon Repair this reward and compare the repaired policy within the saved budget
```

Or invoke a specific process:

```text
/rl-break Find a way to earn completion credit without settling the invoice
/rl-harden Repair the confirmed exploit and preserve valid alternative plans
/rl-diagnose Reward rises while held-out task completion falls
/rl-swarm Compare three reward repairs against the current reward within the saved budget
/rl-sweep Compare two learning rates across three training seeds
/rl-status Show recent runs and identify the next valid action
```

The host finds the relevant files and carries compatible artifacts between commands.
It uses independent workers when the host supports them and the work can proceed separately.
It requests missing domain intent or an uncovered spending decision when that decision blocks dependent work.

## Candidate construction and selection

`/rl-swarm` assigns distinct candidate directories or branches to construction workers and freezes the candidate roster before selection trials.
The host uses its existing agent tools and budget. The local selector does not launch models.
Shared-context worker votes do not supply independent observations.

Freeze the baseline, score bounds, metric direction, improvement margin, sampling method, trial count, and error probability before collecting outcomes.
Run `avalon select --plan PLAN --scores SCORES --out NEW_REPORT` after all declared trials complete.
The selector combines two-sided Hoeffding intervals with a union bound over the frozen candidates.
For maximization, one candidate's lower bound must exceed every competing upper bound.
Minimization reverses that comparison. A candidate that replaces the baseline must also clear the frozen improvement margin.
Overlapping intervals produce an inconclusive result with exit code `5`.
Do not extend a fixed comparison after inspecting its result.
Reserve final evaluation before construction and keep it separate from candidate selection.
The [selection guide](selection.md) defines the input format, executable examples, and assumptions.

`/rl-sweep` freezes settings and seeds, assigns distinct output directories, and retains failed or unexecuted conditions.
Its published Python path uses bounded `gym-train` and `gym-eval` commands.
The Python `0.4.0` wheel supplies `gym-sweep`; inspect that command's help before using it.
The older released Python package does not gain new commands from the Node installation.
Use `/rl-ablate` for a controlled component comparison rather than treating a search result as a causal effect.

## Project and run records

Inspect the project and start a tracked workflow:

```sh
avalon agent doctor --project /path/to/project
avalon agent init --project /path/to/project
avalon agent start rl-data --goal "Check replay preservation" --input source.json --project /path/to/project
```

Inspect recent saved runs with the new runtime:

```sh
avalon agent runs --limit 10 --project /path/to/project
```

`/rl-status` reads the returned records and uses `agent resume` for the relevant runs.
It reports drift or damaged records without changing their state or rerunning training.

Use the returned run identifier and directory.
Add repeated `--input` options for the exact artifacts that define the task.
Project discovery binds conventional metadata. Declare other relevant source and data explicitly.
The private files remain under `.avalon`.
Add `.avalon/` to the project's ignore rules.

The host executes the workflow and records its actual outputs:

```sh
avalon agent record RUN_ID --kind evidence --message "The pipeline comparison completes" --artifact .avalon/runs/RUN_ID/pipeline.json --project /path/to/project
avalon agent finish RUN_ID --status complete --summary "The comparison locates the first changed boundary" --project /path/to/project
```

Complete status requires a nonempty artifact-backed evidence record.
The artifact must be a regular file inside the project.
Declared inputs and artifacts have a 256 MiB limit.
Profiles and event records have a 1 MiB limit.
Completion records describe host-reported execution. They do not independently verify the scientific conclusion.

Use `inconclusive`, `blocked`, or `failed` when the process cannot establish a complete result.
A valid negative experiment can complete successfully.
Read the actual findings before assigning a conclusion.

Resume a compatible run:

```sh
avalon agent resume RUN_ID --project /path/to/project
```

The runtime rejects changed declared inputs or bound metadata.
After reviewing an intentional source change, acknowledge it explicitly:

```sh
avalon agent record RUN_ID --kind decision --message "The grader patch changes the declared source" --accept-drift --project /path/to/project
```

Then execute fresh checks and attach fresh evidence.
An unexplained change requires investigation.
Terminal runs remain immutable. Start a new run that references the previous result.

## Built-in execution

The Python adapter runs a linear categorical policy on the default `CartPole-v1` registration with clipped NumPy REINFORCE.
It retains actual transitions, updates, a checkpoint, and credit receipts.
Training permits at most 20,000 decisions.
The evaluator compares the frozen learned policy with random and named control policies.
It rejects evaluation seeds that overlap the checkpoint's training seeds.
Checkpoint loading requires the exact adapter source hash and matching NumPy and Gymnasium versions.

Example commands from a project with the Python package installed:

```sh
avalon-python gym-train --output .avalon/train-example --environment CartPole-v1 --seed 7 --episodes 30 --max-steps 200
avalon-python gym-eval --checkpoint .avalon/train-example/checkpoint.json --seeds 1001,1002,1003 --output .avalon/evaluation.json
avalon-python gym-probs --checkpoint .avalon/train-example/checkpoint.json --output .avalon/probabilities
avalon-python credit-audit --source .avalon/train-example/credit.json --output .avalon/credit-audit.json
```

Use new output paths. Existing outputs remain intact.
These commands exercise training, evaluation, capture, and credit checks.
Their execution alone does not establish a training improvement.

The live probability adapter records actual categorical rollout decisions and compares an independent learner replay.
It does not capture language-model tokens from TRL or vLLM.
The credit audit checks the declared return, advantage, role, mask, discount, and group relationships.
It does not establish causal importance.

Existing snapshot, pipeline, trace, world, Minari, and finite policy commands remain available.
See the [laboratory CLI](cli.md), [Python laboratory](python-lab.md), and [sampling guide](wave2/sampling.md) for those interfaces.

## Capability boundaries

The command layer can inspect a project, author source, run tests, and add adapters through the host's tools.
A newly authored adapter remains unverified until its declared controls execute.
Framework detection does not establish integration support.
The built-in trainer covers `CartPole-v1`; it does not provide a general PPO, TRL, or vLLM adapter.

Every workflow retains source and data identities, seeds, versions, budgets, commands, failures, and result artifacts where applicable.
Comparisons require a named baseline, a sampling unit, uncertainty, latency, and cost status.
Unknown host-model and compute costs remain unknown.
The final evaluation remains separate from training and candidate selection.
Raw private evidence stays outside published packages unless the release policy explicitly permits it.
