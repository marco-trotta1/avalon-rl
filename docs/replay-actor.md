# Run an episode policy in Docker

`DockerPolicySession` keeps one policy process alive for one episode.
The host owns the environment, reward, termination, action validation, and episode limit.
The actor supplies actions only.
Create a new session for each episode, including each holdout episode.

## Interface

Import `DockerPolicySession` and `ActorError` from `avalon_lab.replay_actor`.
The constructor accepts keyword arguments:

| Argument | Meaning |
| --- | --- |
| `files` | Bounded policy files |
| `entrypoint_file` | A Python file in the policy snapshot |
| `function` | A function that accepts one JSON observation and returns a JSON action |
| `image` | An existing local Python image |
| `timeout_seconds` | Startup exchange and action timeout, from 1 through 60 seconds; default 5 |
| `max_actions` | Action limit, from 1 through 20,000; default 500 |
| `episode_timeout_seconds` | Total actor lifetime, from 1 through 300 seconds; default 60 |

Call `start()`, then call `act(observation)` for each environment step.
Call `close()` in a `finally` block.
The context manager also closes the session.
After startup, `image_id` identifies the immutable image and `candidate_hash` identifies the policy snapshot.

`act()` returns JSON. The host must validate it against the environment action space before stepping.
The actor does not decide whether an action is legal or successful.
It receives no environment seed, expected threshold, reference policy, reward, or reset information.
The host must send the observation only.
An observation can still reveal information about an environment state or seed.

## Isolation and protocol

The session uses the same local Unix socket restrictions and container controls as the [behavioral runner](replay-execution.md).
The container receives policy files and entrypoint names at startup.
Each later request contains an observation and a fresh protocol nonce.
Each response must contain exactly that nonce and one action.
A stale nonce, extra field, duplicate key, non-finite number, or malformed response stops the session.
The policy can retain its own state within the episode.
A new container removes that state between episodes.

Each response line and observation request has a 65,536-byte limit.
Combined captured stdout and stderr have a 1 MiB limit for the complete session.
The startup request has an 8 MiB limit after JSON encoding.
The existing file parser separately limits the policy snapshot to 1 MiB of text.
Each action uses the shorter remaining limit: its action timeout or the total actor lifetime.
The lifetime clock starts immediately before the Docker process launch.
It includes startup and time between action requests.
An expired lifetime returns `episode-timeout` and closes the session.
The CLI uses the default 60-second lifetime.
Cleanup can require additional time after the deadline.
The host must also enforce its episode step limit.

Errors expose stable reason codes through `ActorError.reason`.
They do not expose captured policy output.
Errors close the session before they reach the caller.
`close()` is idempotent and returns output hashes, counts, and the cleanup result.
It makes at most two removal attempts, each with a five-second timeout.
The attempts are separated by 50 milliseconds when the first attempt cannot confirm removal.
A retry handles concurrent Docker removal without treating an unconfirmed result as success.
The hashes cover captured bytes only. Closing a session can leave unread output.

If `cleanup_blocked` is true, stop further episodes and inspect the returned `container_name`.
Do not reset or reuse that session.
The host must retain the interruption and cleanup evidence in its episode report.

## Evidence boundary

The protocol does not authenticate the policy function or its internal computation.
A policy can emit arbitrary action values through the container process.
The host environment independently computes the result of each accepted action.
A reward value in actor output is a protocol error, not an environment reward.
These controls do not establish a complete container security audit.

## Verification

The default tests use authored subprocesses to verify transport behavior.
Those tests never execute supplied policy files on the host.
They are not evidence of Docker execution.

Enable the separate Docker tests explicitly:

```sh
AVALON_REPLAY_DOCKER=1 PYTHONPATH=python/src python3 -m pytest python/tests/test_replay_actor.py
```

The Docker tests use the existing `python:3.11.15-slim` image.
They check state retention, episode separation, scalar and continuous actions, and timeout cleanup.
The host adapter tests must separately verify real environment transitions and rewards.
