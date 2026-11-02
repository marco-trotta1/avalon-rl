# Run a frozen Python world

`ScriptWorldAdapter` runs a project world in its own Docker container.
The policy uses a separate container.
The host does not import or execute the generated world source.
The world receives policy actions through a bounded JSON protocol.

Freeze and review the world before comparing the current process with a proposed repair.
Keep the world files, reward rule, episode seeds, threshold, and image fixed across the comparison.
A changed world is a changed benchmark.

## World interface

The world entrypoint is a Python function that accepts one request object.
It can retain state between requests within one episode.
A reset request contains exactly:

```json
{"op":"reset","seed":7}
```

Return exactly an observation object:

```json
{"observation":{"position":0}}
```

A step request contains the policy action:

```json
{"op":"step","action":{"move":1}}
```

Return exactly these fields:

```json
{"observation":{"position":1},"reward":1.0,"terminated":false,"truncated":false}
```

Observations and actions can use finite JSON values.
The reward must be a finite number. A boolean is not a valid reward.
Both ending flags must be booleans.
Missing fields, additional fields, and invalid values make execution inconclusive.
The world must validate its domain actions before applying them.
A protocol error closes the world session.

## Adapter interface

Construct `ScriptWorldAdapter(world, image=..., max_steps=..., timeout_seconds=5)`.
The `WorldSpec` contains `files` and an `entrypoint` with `file` and `function`.
The constructor starts the world container and resolves its image ID.
Use the same resolved image ID for each benchmark execution.

Call `reset(seed=...)` once, then call `step(action)` until the world ends or the step budget expires.
The adapter enforces a step limit from one through 500.
It marks a completed step as truncated when that budget expires without termination.
Create a fresh adapter for the next episode.
Call `close()` in a `finally` block.

`metadata()` records the world hash, file hash, image ID, limits, and reward authority.
The world hash includes the source files and entrypoint.
The adapter gives the world the reset seed.
The separate policy receives the returned observation, not the world files or seed field.
The world can choose to reveal seed information in an observation. Review that behavior before evaluating holdouts.

## Isolation and limits

The world uses the [Docker actor controls](../replay-actor.md).
It has no network, host mounts, or Docker socket.
It runs as a non-root user with a read-only root filesystem and bounded temporary storage.
Its process can access only its image, supplied files, and protocol requests.
The image must contain the required Python runtime and dependencies before execution.

The world session has a 60-second lifetime budget.
The action timeout defaults to five seconds.
It permits one reset request and at most the declared number of steps.
Requests and responses use the actor's 65,536-byte message limit.
Captured stdout and stderr share the actor's 1 MiB session limit.

`WorldCleanupError` means container removal remains unconfirmed.
Its `receipt`, `cleanup_blocked`, and `container_name` fields preserve the cleanup evidence.
The constructor can raise this error if startup fails and cleanup also fails.
Stop later benchmark runs when this error occurs.
Successful repeated calls to `close()` do not repeat the removal operation.

## What a result establishes

The isolated world defines rewards and ending flags.
The host validates their protocol and records the transitions.
Separating the world from the policy prevents direct policy access to the world's files and process state.
It does not establish that the world accurately represents a real task or uses a correct reward rule.
Review the frozen world, preserve the original failure, and test positive and negative controls.
Record limitations in the project assumptions and split rationale.
A benchmark result is not evidence of real-world performance or model improvement by itself.

## Verification

Default tests use fake sessions to check the protocol, step limits, hashes, and cleanup propagation.
They do not execute generated source on the host.
Enable real Docker tests explicitly:

```sh
AVALON_REPLAY_DOCKER=1 PYTHONPATH=python/src python3 -m pytest python/tests/test_replay_script_world.py
```

The Docker tests require the local `python:3.11.15-slim` image.
They cover a multistep allocation world, file assets with structured actions, and an invalid reward response.
