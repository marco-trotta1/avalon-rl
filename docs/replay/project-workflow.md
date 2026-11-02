# Turn project context into a frozen benchmark

Describe the intended outcome to your coding agent and provide the relevant project context.
The agent constructs the Replay project, records its assumptions, and preserves the current policy.
One `freeze` command fixes the benchmark and captures the baseline.

Replay is general at the project interface.
The current execution interface uses JSON observations and actions, a Python policy, and a separate Python world.
It does not supply every industry's simulator or infer a correct reward from arbitrary data.
External service connectors are not implemented by this format.
Recorded traces alone cannot supply missing transitions or evaluate actions that were never observed.
A useful domain project still requires an accurate world and independent checks.

## Ask your coding agent

Use a request such as this:

```text
Use Avalon Replay to turn this goal and the authorized project context into an executable benchmark.
State your assumptions and define observable success, actions, transitions, and independent checks.
Preserve the current policy as the baseline. Explain the development and holdout split.
Create avalon-project.json, then freeze the benchmark and capture its baseline.
Iterate only on development cases. Compare the chosen candidate against the frozen holdout cases.
```

The agent performs the context interpretation and authoring.
The runtime reads explicit manifests and executes their declared workflows.
It does not contain an autonomous model client that discovers the project goal or writes the world.

The agent should use only the authorized context needed for the task.
The runtime does not scan a repository or collect all local data.
Context assets remain explicit text entries in the project manifest.
Keep them private unless their owner authorizes a stated use.

## Construct the project

1. State the user's goal and the observable evidence required for success.
2. Define observations, allowed actions, world transitions, episode boundaries, and independent checks.
3. Record assumptions and known gaps between the simulation and the intended work.
4. Preserve the current policy and observed failure before constructing a repair.
5. Add a passing control and a known failing control that exercise the intended outcome.
6. Explain the development and holdout split using the relevant groups and time boundaries.
7. Store the explicit source snapshots and context in `avalon-project.json`.

The [project format](project-format.md) defines the required fields and limits.
The world receives reset and step requests. It returns observations, rewards, and episode flags.
The policy receives observations and returns actions.
The world and policy use separate execution sessions.

Distinct seeds do not establish independent cases.
Related customers, sites, documents, scenarios, or time periods can leak information between splits.
The manifest requires a split rationale, but the parser cannot prove that the rationale is correct.

## Freeze the benchmark and baseline

From the project directory, run:

```sh
avalon-replay freeze
```

The command reads `avalon-project.json` and writes `.avalon/benchmark` by default.
It records the project and benchmark identities and captures the baseline against the fixed evaluation setup.
The project hash binds context and narrative as well as the executable benchmark.
The benchmark hash binds the task, world, cases, controls, thresholds, and policy evidence.

Use explicit paths when necessary:

```sh
avalon-replay freeze \
  --project avalon-project.json \
  --output .avalon/benchmark \
  --image python:3.11.15-slim
```

Repeating `freeze` for the same project reuses the saved frozen receipt instead of executing another baseline.
A different project at the same output path fails.
Use a new benchmark directory when the project changes.
Retain the original benchmark and its negative results.

The receipt is a record with content hashes. It is not authenticated or tamper-proof storage.
Review the saved controls and execution status before treating the baseline as usable evidence.
An inconclusive cached receipt remains inconclusive. It does not become a successful baseline on reuse.
To retry failed baseline execution, select a new output directory and retain the original receipt.

## Iterate on development cases

Supply a candidate as a source file or JSON file map:

```sh
avalon-replay develop --candidate repair=policy.py
```

Use repeated `--candidate NAME=FILE` arguments to compare development candidates.
The default benchmark is `.avalon/benchmark`.
Omitting `--output` selects a new private result directory.
Development uses only the declared development cases.

Training can use a separate environment and learning algorithm.
Replay does not automatically update model weights.
Keep the world, reward logic, and evaluation cases fixed when comparing those candidates with the baseline.

## Evaluate the chosen candidate

Select and freeze one candidate before inspecting holdout results:

```sh
avalon-replay compare --candidate selected=policy.py
```

The command evaluates that candidate on the frozen holdout cases.
Use `--benchmark` to select another benchmark directory and `--output` to select a new result directory.
The final evaluation uses the frozen world, checks, and case roster.
Do not tune the candidate repeatedly on holdout results and still describe those cases as unseen.

Compare the result with the original goal as well as the numerical threshold.
A passing score cannot justify changing the goal after observing a failure.
If the intended outcome changes, create a new benchmark with a new baseline.

## Demonstration and limits

`avalon-replay project-demo --output DIR` writes `avalon-project.json`, `candidate.py`, and `baseline.py`.
The example allocates a resource across two steps.
Its scenarios repeat across development and holdout splits, as the manifest explicitly states.
It demonstrates the workflow and does not establish a new learning result or commercial value.

Keep execution failures and failed controls visible.
A hash does not establish that a reward is correct or resistant to exploitation.
Separate processes limit candidate access to the world implementation. They do not guarantee protection against every reward exploit.

The local runtime and evidence workflow remain open source.
Private domain tasks, licensed collections, and managed services are possible offerings with explicit permissions and separate agreements.
A passing benchmark does not establish buyer demand, revenue, or contributor earnings.
