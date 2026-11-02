# Avalon Replay function tasks

Turn a coding failure into an executable task. Test repairs against behavioral checks and retain the evidence.
This guide covers Python function tasks with JSON inputs and outputs.
For games, simulated control, and trusted custom worlds, read the [environment guide](general-environments.md).
It runs locally and makes no model calls.

## Run the demonstration

Use Python 3.13 or later and a local Docker daemon on a POSIX host.
Replay rejects remote Docker endpoints.
Review the candidate code and task specification before execution.
Docker isolation reduces host exposure. It is not a security proof for hostile code or a compromised image.

From the Avalon source directory:

```sh
docker pull python:3.11.15-slim
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli demo --output /tmp/replay-demo
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli run \
  --task /tmp/replay-demo/task.json \
  --candidate repair=/tmp/replay-demo/repair.json \
  --candidate overfit=/tmp/replay-demo/overfit.json \
  --output /tmp/replay-results
```

Use new output directories for each run. Replay preserves existing directories and files.
The mixed demonstration returns exit code `4` because the overfit candidate fails.
Open `/tmp/replay-results/report.html` to review the report.
The matching `report.json` preserves the execution evidence.

For an installed command, install the current source package in a virtual environment:

```sh
python -m pip install --no-deps ./python
avalon-replay demo --output /tmp/replay-demo-2
```

The standalone Replay command uses the standard library and Docker.
The Gymnasium adapter requires the dependencies in the [Python guide](../python-lab.md).
Existing installations can lack Replay until they install a source version containing it.

## What the demonstration establishes

An authored invoice function incorrectly includes inactive rows.
A repair uses a different implementation from the reference and satisfies the behavioral checks.
An overfit candidate passes the development input but fails both holdout inputs.
The report keeps these results separate.

The controls include a legitimate alternative and a function with the original defect.
Their expected results must hold before the campaign accepts a repair.
Crashes, timeouts, unavailable images, and unconfirmed cleanup remain inconclusive.
They cannot satisfy a negative control merely by failing to run.

These authored cases test product behavior. They establish no model improvement or production accuracy.

## Capture a real failure

Write a task using the [Replay format](../replay-format.md).
Include the initial, observed, and reference file snapshots.
Declare the function entrypoint, expected behavior, tests, protected paths, and controls.
Keep the rights status private unless the owner authorizes specific uses.

```sh
avalon-replay validate --task task.json
avalon-replay run --task task.json --candidate repair=repair.json --output result-directory
```

A candidate file contains a JSON object that maps relative file paths to text.
Invalid candidate files fail before Replay creates the output directory.
The parser rejects unsupported fields, unsafe paths, ambiguous keys, and excessive input sizes.
The current format is separate from the earlier `avalon.failure.v1` snapshot format.
Use `avalon failure` for exact file checks and Replay for executable Python behavior.

Each test runs in a new restricted container.
The host sends only candidate files, the entrypoint, and that test's arguments.
The host retains expected results, reference code, other tests, and the final comparison.
The [execution guide](../replay-execution.md) states the resource limits and security boundaries.

## Read the decision

| Decision | Meaning |
| --- | --- |
| Accepted | The controls behave as declared and the candidate passes every supplied check. |
| Rejected | A required behavioral result or protected snapshot check fails. |
| Inconclusive | The available execution evidence does not support a decision. |

The campaign contains separate development and holdout counts, hashes, image identity, and execution times.
The [campaign guide](../replay-campaign.md) describes control validation and aggregation.
A mixed campaign is rejected when a candidate is rejected. Inspect the individual candidate decisions.

Protected snapshot checks compare supplied files on the host.
Runtime file hashes come from the candidate's interpreter and remain unauthenticated diagnostics.
A candidate can interfere with its interpreter or output protocol.
Do not treat Replay as a general reward-hacking defense or authenticated execution service.

## Connect a training loop

```python
from avalon_lab.replay_contract import parse_replay_task
from avalon_lab.replay_env import ReplayEnvironment
import json

with open("task.json", encoding="utf-8") as source:
    task = parse_replay_task(json.load(source))

env = ReplayEnvironment(task=task)
observation, info = env.reset(seed=7)
result = env.step("def total_active(rows):\n    return 0\n")
```

This is a one-step coding environment. The action replaces the entrypoint source.
The observation contains the task description, entrypoint, and initial files.
The reward uses development tests only. It does not expose expected results or holdout tests to the candidate container.
Unconfirmed cleanup also blocks further episodes on that environment instance.
Confirm removal of the recorded containers before creating a new instance.
A normal outcome terminates the episode. An inconclusive execution or runner startup error truncates it.
The observation limit follows the task size. The action limit respects the remaining snapshot byte budget.
Use the separate campaign to evaluate a frozen candidate on all tests.
The adapter does not itself update model weights or prove that an author lacked holdout access.

## Commercial direction

Use Replay to prepare a reviewed task family or evaluate a customer's repair under agreed acceptance criteria.
The open core remains useful without a marketplace or hosted account.
Managed reconstruction, private runs, and accepted task delivery are proposed paid services.
Replay does not settle payments, publish private data, or establish licensing permission.
Read the [product direction](strategy.md) for competitor sources and the proposed customer experiment.
