# Avalon Replay episode format

The `avalon.replay-episode.v1` format describes a policy experiment in an environment with reset and step operations.
It is separate from the existing `avalon.replay.v1` function task format.
Existing function tasks retain their format and behavior.

The environment runs outside the policy container.
The policy receives an observation and returns an action.
The host computes rewards and determines termination.
Policy output cannot declare its own reward or success.

## Required fields

| Field | Content |
| --- | --- |
| `format` | `avalon.replay-episode.v1` |
| `id` | A stable task identifier |
| `title` | A title with at most 200 characters |
| `description` | The intended behavior, with at most 8000 characters |
| `provenance` | The source, model identifier, and capture time |
| `rights` | Private status or an authorization attestation |
| `environment` | The adapter name, environment identifier, and JSON configuration |
| `policy` | The relative Python file and function name |
| `snapshots` | Initial, observed, and reference policy file maps |
| `controls` | Known passing and failing policy snapshots |
| `episodes` | Frozen seeds with development and holdout labels |
| `max_steps` | The step limit for each episode |
| `min_return` | The finite return threshold |

All fields are required. Unknown fields are rejected, including fields inside nested objects.
The contract validates the data without loading an environment or running a policy.

## Environment and policy

An environment declaration has this form:

```json
{"adapter":"gymnasium","id":"CartPole-v1","kwargs":{}}
```

The contract accepts an adapter identifier and a JSON object of configuration values.
The host resolves the adapter and validates its supported environments and configuration.
A valid manifest does not establish that the installed host supports the requested environment.

The first policy interface uses Python:

```json
{"file":"policy.py","function":"act"}
```

The policy file must exist in the initial snapshot.
The function name must be a valid Python identifier that is not a keyword.
The policy snapshot contains code and supporting text files.
It does not contain the host environment or reward calculation.

The initial adapter scope is distinct from the format's extensibility.
An adapter name in a manifest does not implement a game, simulator, or robotics connection.
Each additional adapter requires host integration and execution evidence.

## Frozen episodes

Each episode declares an identifier, split, and seed:

```json
{"id":"balance-development-7","split":"development","seed":7}
```

Include at least one development episode and one holdout episode.
Use distinct episode identifiers and seeds across the complete task.
Seeds are integers from 0 through 4,294,967,295. Boolean values are not seeds.
The step limit is an integer from 1 through 500.
The return threshold must be a finite number.

A frozen seed makes a requested initialization explicit.
It does not guarantee identical results across simulator versions, hardware, or nondeterministic adapters.
Holdout seeds within one environment do not establish performance on unseen environment families.
The labels do not prove that the policy author lacked access to those seeds.

## Controls and evidence

Each control contains an identifier, declared outcome, and complete policy file map:

```json
{"id":"constant-action","expect":"fail","files":{"policy.py":"def act(observation):\n    return 0\n"}}
```

Include at least one `pass` control and one `fail` control.
Use distinct control identifiers.
The declaration requires execution before it becomes evidence.
A reference policy is a proposed solution. Its presence does not prove success.

Provenance and rights use the same structures as the [function task format](replay-format.md).
Use `synthetic` for authored demonstrations.
Keep tasks private until the data owner authorizes the intended use.
An attestation does not establish ownership or create a sale.

## Limits and identity

| Input | Limit |
| --- | --- |
| Complete task | 10 MiB of JSON |
| Episodes | 12 |
| Controls | 4 |
| Steps per episode | 500 |
| Files per snapshot | 100 |
| Text per snapshot | 1 MiB of UTF-8 content |
| File text | 65,536 characters |
| File path | 240 characters |

Paths reject traversal, absolute paths, reserved names, case collisions, and file-directory collisions.
Environment configuration follows the existing bounded JSON rules.
These limits bound manifest size and declared work. They do not replace runtime resource limits.

`parse_episode_task(value)` copies and validates unknown input.
It returns an `EpisodeTask` with frozen outer dataclasses and read-only file maps.
Nested environment configuration retains ordinary mutable JSON containers.
Do not modify the task during an experiment.

`episode_task_to_dict(task)` returns an independent JSON representation.
`episode_task_hash(task)` hashes canonical task JSON with SHA-256.
The hash binds adapter configuration, policy evidence, seeds, limits, controls, and permissions.
Canonicalization sorts object keys and preserves array order.
The hash identifies content. It does not authenticate the contributor or establish generalization.
