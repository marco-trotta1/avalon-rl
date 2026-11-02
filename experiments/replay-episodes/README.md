# Replay episode checks

These checks execute authored policies in real host simulators and restricted Docker actors.
They test the episode workflow. They do not train a policy.

## Recorded result

Each policy runs once on seeds 7, 19, 41, and 53.
Seeds 7 and 19 have development labels. Seeds 41 and 53 have holdout labels.
The authors can inspect these seeds. The labels do not prove an unseen evaluation.

| World | Always-left baseline return | Reference and repair return | Campaign wall time |
| --- | --- | --- | --- |
| CartPole-v1 | 9, 10, 10, 10 | 100, 100, 100, 100 | 9,545.8 ms |
| FrozenLake-v1 | 0, 0, 0, 0 | 1, 1, 1, 1 | 8,582.9 ms |

Returns are undiscounted reward sums. The CartPole limit is 100 steps. The FrozenLake limit is 20 steps.
Each campaign executes 24 episodes across the baseline, reference, two controls, and two candidates.
The repair passes. The always-left candidate fails. Each campaign correctly returns the rejected status because it includes that failing candidate.
Uncertainty is not estimated from this single fixed-seed run.
The deterministic FrozenLake map has the same initial condition for all four seeds.

The campaigns make zero model API calls at zero model API cost.
Local compute and candidate generation costs are unpriced.
The [results](results.json) retain policy hashes, task hashes, image identity, library versions, individual returns, and individual wall times.
The collector removes its temporary full traces after extracting these records.

## Reproduce

Install the tested Python dependencies and start Docker.
Run these commands from the repository root:

```sh
docker pull python:3.11.15-slim
PYTHONPATH=python/src python3 experiments/replay-episodes/collect.py
```

The collector replaces `results.json` with the new measurements.
Container startup, host load, and Docker caching affect wall times.
The recorded host uses Python 3.13.5, Gymnasium 1.2.3, and NumPy 2.4.2.
The policy container uses Python 3.11.15.

## Verification and limits

Local verification passes 346 Node tests, 430 Python tests, and nine separately enabled Docker tests.
The normal Python run skips those nine Docker tests. The explicit Docker run passes all nine.
The continuous-control test drives Pendulum for three steps with a zero-torque policy.
It checks the interface and cleanup. It does not establish a robotics control improvement.

The first Docker attempt fails because the cached image is unavailable.
Loading the documented image resolves that prerequisite failure.
A later real test exposes overlapping automatic and explicit container removal.
A bounded removal retry resolves that race. Unconfirmed removal still blocks the campaign.

The tests validate the command, campaign, policy transport, built-in worlds, and an authored custom adapter.
They do not validate live robots, every simulator, learned policy improvements, production demand, or revenue.
The static HTML receives programmatic checks. Visual inspection remains unverified.

See the [environment guide](../../docs/replay/general-environments.md) for adapter boundaries.
The step and reset interface follows the [Gymnasium environment API](https://gymnasium.farama.org/api/env/).
