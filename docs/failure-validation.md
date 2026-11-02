# Failure workflow validation

The validation runs against the integrated source on November 1, 2026.
The parent commit is `9634d7c3db5a54ea953be4c6b20003d94f6daa37`.
Three implementation agents contribute capture, replay, and licensing work.
The coordinator integrates the CLI, documentation, and local task directories.

## Results

| Check | Result |
| --- | --- |
| Node suite | 346 tests pass across 43 files |
| Python suite | 273 tests pass; 78 existing Minari metadata warnings |
| TypeScript | `npm run typecheck` passes |
| Agent package | `npm run check:agent` passes for 23 workflows |
| Privacy source check | `npm run check:privacy` passes |
| Distribution | The package contains all five failure modules and the workflow guide |
| CLI network boundary | All seven CLI tests preload the network blocker |

Node is `22.22.3`. TypeScript is `7.0.2`. Vitest is `5.0.5`. Zod is `4.6.7`.
Python tests use the existing `/private/tmp/avalon-wave2-python` environment and the current source through `PYTHONPATH`.
The system Python initially fails collection because Gymnasium and Minari are absent.
The existing test environment resolves that dependency issue without changes to project dependencies.

## Regression evidence

The new environment tests first expose UTF-8 marker loss and acceptance of an oversized candidate.
Both tests fail before their fixes and pass afterward.
The split tests first expose duplicate tasks crossing development and holdout boundaries.
Both tests fail before the fingerprint check and pass afterward.

The first integrated Node run reports 345 passes and one failure.
Its CLI fixture incorrectly puts identical task content in separate families.
The corrected fixture uses distinct initial content. The next full run passes all 346 tests.

The first package dry run cannot write the default npm cache under the filesystem policy.
The dry run succeeds with a task-specific cache in `/private/tmp`.

## Reproduce

```sh
npm run typecheck
npm run check:agent
npm test
npm run check:privacy
PYTHONPATH=python/src AVALON_CLI="$PWD/dist/cli.js" python -m pytest python/tests -q
npm pack --dry-run
```

Install the tested Python dependencies before running the Python command.

## Limits

These tests check implementation behavior using authored fixtures.
They do not measure production detection accuracy, model gains, buyer demand, revenue, or scientific novelty.
No model inference, training, payment, or external data delivery occurs.
No latency or cost advantage is claimed.
The fixture counts are exact for these runs. They are not population estimates.
