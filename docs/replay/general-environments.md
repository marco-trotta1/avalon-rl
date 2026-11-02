# Evaluate policies in games and simulated control

Avalon Replay can evaluate policies through complete episodes with observations, actions, rewards, and termination.
The CLI supports built-in worlds. The Python API also accepts trusted custom adapters.
Replay also retains its Python function tasks and one-step coding environment.

The policy receives observations inside an isolated Docker actor.
It returns actions to the host adapter.
The trusted host computes rewards and episode boundaries.
The actor does not receive authority to declare success or modify the world implementation.

This is a CLI and Python API feature.
It does not add a hosted application or automatically train model weights.
Existing RL training workflows remain available.

## Run a game demonstration

Install the dependencies from the [Python guide](../python-lab.md).
Start Docker and load the policy image.
Use new output directories for each run.

```sh
docker pull python:3.11.15-slim
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli demo \
  --environment FrozenLake-v1 --output /tmp/replay-grid
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli validate \
  --task /tmp/replay-grid/task.json
PYTHONPATH=python/src python3 -m avalon_lab.replay_cli run \
  --task /tmp/replay-grid/task.json \
  --candidate repair=/tmp/replay-grid/repair.json \
  --candidate baseline=/tmp/replay-grid/baseline.json \
  --output /tmp/replay-grid-result
```

Open `/tmp/replay-grid-result/report.html` to inspect the private report.
The JSON report retains execution evidence for programmatic analysis.
Use `--environment CartPole-v1` to create the simulated balance demonstration.
Both demonstrations use authored policies. They do not contain trained weights or production failure data.

Omit `--environment` to create the existing function task demonstration.
The `validate` and `run` commands select the task type from its format field.
A manifest that passes validation can still request an unavailable adapter or runtime.

## Built-in worlds

| Environment | Action | Supported configuration |
| --- | --- | --- |
| `CartPole-v1` | Discrete action | No options |
| `FrozenLake-v1` | Discrete action | `map_name`: `4x4` or `8x8`; `is_slippery`: boolean |
| `Taxi-v3` | Discrete action | No options |
| `Pendulum-v1` | Continuous control array | No options |
| `MountainCar-v0` | Discrete action | No options |

The built-in adapter uses explicit constructors from Gymnasium.
It does not load arbitrary environment registrations from a manifest.
It rejects actions with invalid types, shapes, bounds, or non-finite values.
The declared step budget also bounds each episode.
The adapter uses direct constructors and applies the manifest step limit instead of the standard Gymnasium `TimeLimit` wrapper.
Results can therefore differ from default `gym.make` episodes with a different time limit.
A simulation is not a live robotics integration.

## Supply a policy

The initial policy interface is a Python function:

```python
def act(observation):
    return 0
```

The policy returns one JSON action for the current observation.
The Docker actor persists through one episode so the policy can retain internal state.
Each episode starts with a fresh actor and a reset host environment.
The reference implementation, controls, and candidates use the same declared episode seeds and step limits.

The [episode format](../replay-episode-format.md) defines the file snapshots, permissions, controls, and frozen seeds.
Keep development and holdout seeds distinct.
Record the candidate before inspecting holdout results.
Labels alone do not prove that an author lacked access to the holdout seeds.

## Add a trusted environment adapter

Supply an `adapter_factory` to `run_episode_campaign` through the Python API.
The factory signature is `factory(spec, *, max_steps)`. It creates an adapter from the environment specification and step budget.
Adapters implement this interface:

```python
class EnvironmentAdapter(Protocol):
    def reset(self, *, seed: int) -> Json: ...
    def step(self, action: Json) -> Transition: ...
    def close(self) -> None: ...
    def metadata(self) -> dict[str, object]: ...
```

A `Transition` contains the next observation, reward, termination flag, and truncation flag.
The adapter validates actions before applying them.
Its metadata should identify the implementation, version, configuration, and relevant data snapshot.
The adapter closes its resources when an episode ends or fails.

Custom adapters run as trusted host code.
Review the adapter and its dependencies before use.
A manifest cannot install an adapter or grant access to a simulator, device, network service, or account.
The command does not load arbitrary adapter code from a task file.

This interface can connect other games and simulators when their observations and actions have bounded JSON representations.
It does not establish integrations with every environment.
New domains require an adapter, appropriate controls, reproducible execution, and separate evidence.

## Interpret the evidence

Each episode compares its undiscounted host reward sum with `min_return`.
The comparison permits an absolute tolerance of `1e-9` reward units for floating-point accumulation.
Every required episode must meet the threshold for that policy to pass.
Reaching the declared step limit completes a bounded evaluation with truncation. An execution timeout remains an infrastructure failure.

Keep negative controls, failed candidates, skipped episodes, and runtime failures in the report.
A runtime failure does not count as a successful episode.
Unconfirmed container cleanup blocks further work in the campaign.
Confirm removal of the reported containers before starting another campaign.

Report return, episode counts, seeds, versions, latency, and cost together.
An improvement on frozen seeds does not establish generalization to new environment families.
Candidate evaluation does not update model weights.
Use a separate training method and an independent evaluation to make training claims.

## Open source and commercial use

The local runtime, adapter interface, and evidence workflow remain open source.
No hosted account is required to run them.
Private domain tasks, licensed task collections, and managed evaluation services are possible commercial offerings.
They require explicit data permissions and separate agreements.

Task execution does not transfer ownership, publish private data, collect payment, or guarantee contributor earnings.
A passing task does not establish buyer demand or Avalon revenue.
Keep the free runtime useful without a licensing transaction.
