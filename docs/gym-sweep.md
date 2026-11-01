# Run a bounded training sweep

The sweep trains a frozen candidate roster on the built-in `CartPole-v1` environment.
It records selection evidence for the separate Hoeffding selector.
It does not execute arbitrary commands or load external environment plugins.

Python package `0.4.0` includes `gym-sweep`.
The [workflow protocol](../skills/_shared/workflow.md#prepare-python-when-required) prepares the verified wheel from release `v0.7.0`.
To install from a source checkout, use these commands.
Use a new virtual environment directory. Preserve an existing environment.

```sh
python3 -m venv .avalon/python-sweep
.avalon/python-sweep/bin/python -m pip install -e ./python
.avalon/python-sweep/bin/avalon-python gym-sweep --config examples/sweep/cartpole.json --output /tmp/avalon-cartpole-sweep
```

Use a new output directory for each execution.
The command preserves existing paths and returns a nonzero exit code if a workflow fails.
It returns zero when all training and evaluation calls complete, including negative results.

## Configure the sweep

Use the [example configuration](../examples/sweep/cartpole.json) as the input format.
The parser rejects unknown fields, duplicate keys, nonfinite numbers, symlinks, and special files.
The input must be a regular JSON file of at most 64 KiB.

| Field | Required value or limit |
| --- | --- |
| `format` | `avalon-gym-sweep-v1` |
| `evaluation.seed` | A uint32 seed for the evaluation seed generator. |
| `evaluation.episodes` | 2 through 64 episodes per policy. |
| `evaluation.maxSteps` | 1 through 500 steps per evaluation episode. |
| `delta` | A finite error budget greater than zero and less than one. |
| `minImprovement` | A nonnegative improvement threshold, at most `evaluation.maxSteps`. |
| `candidates` | 1 through 8 candidates with distinct IDs. |
| Candidate `id` | 1 through 48 lowercase letters, digits, or hyphens. Start with a letter. Reserve `random` for the control. |
| Candidate `seed` | A uint32 training seed. |
| Candidate `episodes` | 1 through 1,000 training episodes. |
| Candidate `maxSteps` | 1 through 500 steps per training episode. |
| Candidate `learningRate` | A finite number greater than zero and at most 0.1. |
| Candidate `discount` | A finite number from zero through one. |

Each candidate can declare at most 20,000 training transitions.
The full roster can declare at most 80,000 training transitions.
The example declares 12,000 training transitions across two candidates.
These limits describe the configuration, not measured training improvement.

## Inspect the evidence

The sweep completes all candidate training before it writes `selection-plan.json`.
The plan binds the checkpoint hashes, candidate IDs, metric bounds, baseline, error budget, and complete evaluation sample inventory.
The sweep writes the plan before the first evaluation call.
It checks each returned checkpoint identity against the plan.

The evaluation generator samples uint32 reset seeds uniformly without replacement.
It excludes every recorded training episode seed from every candidate.
All candidates use the same complete evaluation seed list.
The fixed checkpoint, environment registration, and action generator produce a deterministic result for each reset seed.

The `uniform-without-replacement` assumption refers to this finite eligible seed population.
It does not treat agent votes, tokens, or environment steps as independent samples.
The generator seed fixes the reproducible sample realization.
Reserved seeds do not establish an externally blind evaluation.
The scores do not measure training-seed variation or new environments.

| Artifact | Contents |
| --- | --- |
| `sweep-config.json` | The effective frozen configuration. |
| `candidates/ID/training.json` | The training updates, completed episodes, latency, and resource records. |
| `candidates/ID/checkpoint.json` | The trained policy and recorded source identity. |
| `candidates/ID/credit.json` | The returns, advantages, masks, and episode groups. |
| `candidates/ID/evaluation.json` | The policy returns, controls, paired comparisons, and measured latency. |
| `selection-plan.json` | The frozen selection roster and evaluation design. |
| `selection-scores.json` | The raw bounded returns and the raw plan file hash. |
| `report.json` | The execution status, versions, source hashes, budgets, latency, cost, and limits. |
| `failure.json` | The retained failure summary, when a workflow fails. |

The `random` baseline uses the first complete evaluation's uniform random control.
Its artifact identity hashes the control specification, adapter source identity, episode cap, and library versions.
Every successful candidate records all declared evaluation samples.
A failed candidate retains a failure record instead of a shortened sample list.
Other evaluations continue after an evaluation failure.
A training failure stops the sweep before selection evidence exists.
The completed training files remain available.

The existing adapter returns one complete evaluation at a time.
A failed evaluation call can complete episodes before it raises an exception.
Those episodes are not returned or used as selection samples.
The failure summary and earlier completed artifacts remain available.

Candidate score latency includes the measured training call and learned policy rollouts.
Baseline score latency includes its recorded uniform random rollouts.
The report also records execution latency after configuration parsing, including repeated control evaluations.
This measurement excludes the final report writes.
Each latency measurement has one execution and no estimated latency interval.
The local process makes zero external model calls.
External API cost is USD 0. Local compute and host-agent costs remain unpriced.

## Select a candidate

Run the selection command against the saved plan and scores.
Use the [agent command guide](agent-commands.md) for the current command syntax.
The sweep does not select a candidate or claim an improvement.
Keep an inconclusive or negative selection result with the sweep evidence.

Use a separate final holdout after candidate selection.
Freeze a new plan before evaluating candidates that depend on earlier selection results.
The checkpoint loader checks the adapter source hash.
Preserve that source version to replay an existing checkpoint.
