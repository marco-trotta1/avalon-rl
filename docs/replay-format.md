# Avalon Replay task format

Avalon Replay records a Python function task, its failure evidence, behavioral tests, controls, and data permissions.
The format identifier is `avalon.replay.v1`.
The contract parser does not execute candidate code.

Keep the manifest outside the candidate environment.
The manifest contains the reference implementation and expected test outputs.

## Required fields

| Field | Content |
| --- | --- |
| `format` | `avalon.replay.v1` |
| `id` | A stable task identifier |
| `family_id` | A shared identifier for related tasks and variants |
| `title` | A task title with at most 200 characters |
| `description` | The intended behavior, with at most 8000 characters |
| `provenance` | The source, model identifier, and capture time |
| `rights` | Private status or an authorization attestation |
| `entrypoint` | The relative Python file and function name |
| `snapshots` | The initial, observed, and reference file maps |
| `tests` | Development and holdout function calls with expected outputs |
| `protected_paths` | Initial files that the candidate must preserve |
| `controls` | Known passing and failing candidate snapshots |

All fields are required. Unknown fields are rejected, including fields inside nested objects.
The observed snapshot preserves the recorded failure.
The reference snapshot is a proposed solution. Its presence does not prove correctness.

The entrypoint has this form:

```json
{"file":"solution.py","function":"add"}
```

The file must exist in the initial snapshot and use a `.py` suffix.
The function must use a valid Python identifier that is not a keyword.
The function receives JSON arguments and returns a JSON result.

## Behavioral tests

Each test supplies an identifier, split, positional arguments, keyword arguments, and expected result:

```json
{
  "id":"positive-development",
  "split":"development",
  "args":[2,3],
  "kwargs":{},
  "expected":5
}
```

Include at least one development test and one holdout test.
Use distinct test identifiers and distinct argument combinations across both splits.
The parser compares canonical argument JSON when detecting duplicate inputs.
This check does not establish semantic independence between tests.

Use a shared `family_id` for related tasks.
A holdout test within one family does not establish performance on unseen families.
Keep expected outputs on the host when executing the candidate.
The runner determines behavioral equality. The contract does not prescribe byte equality for program implementations.
Protected files require separate preservation checks.

## Controls

Each control supplies an identifier, expected status, and complete candidate file map:

```json
{"id":"known-failure","expect":"fail","files":{"solution.py":"def add(a, b):\n    return a - b\n"}}
```

Include at least one `pass` control and one `fail` control.
Use distinct control identifiers.
Controls require execution before their declared outcomes become evidence.

## Provenance and permissions

Provenance has three fields:

```json
{"source":"synthetic","model":"authored-control","captured_at":"2026-11-01T00:00:00Z"}
```

The source is `synthetic` or `user`.
Use `synthetic` for authored examples.
The timestamp must include a timezone.
The model identifier records the contributor's statement. Avalon does not authenticate its origin.

Private cases use `{"status":"private"}`.
An authorized case has an owner and an explicit list of permitted uses:

```json
{"status":"authorized","owner":"Example owner","allowed_uses":["evaluation"]}
```

The permitted uses are `evaluation`, `training`, and `redistribution`.
Declare each use once.
Permission for evaluation does not imply permission for training or redistribution.
An attestation does not establish ownership, remove secrets, or create a sale.

## Input limits

| Input | Limit |
| --- | --- |
| Complete task | 10 MiB of JSON |
| Tests | 32 |
| Controls | 8 |
| Files per snapshot | 100 |
| Content per snapshot | 1 MiB of UTF-8 text |
| File text | 65,536 characters |
| File path | 240 characters |
| JSON nesting | 24 levels |
| JSON array | 10,000 items |
| JSON object | 1000 fields |
| Positional or keyword arguments | 100 each |

Paths use relative portable segments.
Dotfiles are permitted. Traversal, absolute paths, reserved names, case collisions, and file-directory collisions are rejected.
Each protected path must exist in the initial snapshot.
Protected paths cannot repeat.

Numbers must be finite.
Integers must remain between negative and positive 9,007,199,254,740,991.
This range preserves exact integer interoperability with JSON consumers that use binary64 numbers.

## Python interface

`parse_replay_task(value)` validates unknown input and returns a `ReplayTask`.
`parse_files(value)` validates a candidate file map.
The parser copies the input data.
Task dataclasses are frozen, and file maps are read-only.
Nested test arguments and expected outputs retain ordinary mutable JSON containers.
Do not modify a parsed task during an evaluation.

`task_to_dict(task)` returns an independent JSON representation.
`task_hash(task)` computes SHA-256 over canonical task JSON.
Canonicalization sorts object keys and preserves array order.
The hash binds the evidence, tests, controls, provenance, and permissions.
The hash identifies content. It does not authenticate the contributor or prove that the task is useful.
