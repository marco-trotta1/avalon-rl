# Laboratory commands

Build the CLI with `npm run build`.
Run `node dist/cli.js lab-demo` for a synthetic reward mismatch.
Run `node dist/cli.js lab-demo --fault none` for the clean control.
The demonstration always returns exit code `0` when it completes.
The report states whether the injected fault fails the audit.

Compare actual snapshots with this command:

```sh
node dist/cli.js audit --source source.json --target learner.json --out audit.json
```

The audit returns `0` for a pass, `4` for a failure, and `5` for an inconclusive result.
File or data errors return `1`.
Usage errors return `2`.
Inputs must be regular UTF-8 files.
The CLI rejects named pipes without waiting for a writer.
Snapshot inputs have a 10 MiB limit.
Saved audit reports have a 256 MiB limit and can contain at most 500,000 findings.
Use `snapshot --data snapshot.json` for a format summary.
That summary does not compare pipeline stages.

Without `--out`, JSON goes to stdout.
With `--out`, the CLI creates an owner-only file.
It refuses existing files and output symlinks.
Keep the snapshots and reports private.
The commands call no external service.

## Portable exports

```sh
node dist/cli.js report --data audit.json --format markdown --out audit.md
node dist/cli.js report --data audit.json --format sarif --out audit.sarif
```

The `report` command checks that the saved summary agrees with its findings.
It returns `0` when the export completes, including exports of failing audits.
SARIF uses version `2.1.0` and preserves rule IDs, severity, and field fingerprints.
The CLI does not upload the SARIF file.
Markdown replaces line separators with spaces before it escapes supplied labels and messages.
This includes CR, LF, and CRLF separators.
All exports retain the synthetic or user-supplied evidence marker.

## Complete pipeline

```sh
node dist/cli.js pipeline --source source.json --recorded recorded.json --target learner.json
node dist/cli.js contamination --source train.json --target eval.json
node dist/cli.js witness --source source.json --target learner.json --out witness.json
```

The pipeline compares each adjacent stage and each later stage with the original source.
Without explicit lineage links, the result remains inconclusive.
Use `--lineage links.json` to supply two objects with `parentSha256` and `childSha256` fields.
The links use canonical snapshot hashes from the audit reports.
Hash links bind supplied artifacts. They do not prove that a process runs.

Witnesses contain raw selected evidence. Keep them private.
Witness extraction requires a new output path.
Use `--finding` to select a zero-based finding index.
The index must be between `0` and `499999` and must identify an existing finding.
The reduction preserves the selected finding within a bounded search.
It does not prove global minimality.

Use `--absolute-tolerance` and `--relative-tolerance` to declare numeric tolerance.
Both defaults are `0` for exact preservation.
The report retains these policy values.

## Operations world

```sh
node dist/cli.js world-demo
node dist/cli.js world-challenge
node dist/cli.js world-search --budget 1000 --depth 3
node dist/cli.js world-benchmark --repetitions 25
node dist/cli.js world-curriculum --budget 8
node dist/cli.js world-export --out world.json
node dist/cli.js world-run --data action-plan.json
```

All world records are synthetic.
The commands return `0` when an experiment completes, including expected verifier failures.
The world never transfers money or changes an external record.
The curriculum uses a known-good script. It does not train a model.
The search covers only its declared action alphabet and depth.

An action plan selects a task and a finite action sequence:

```json
{"seed":7,"task":"settle-a","actions":[{"type":"claim-done"},{"type":"finish"}]}
```

This plan receives a weak reward while the independent outcome check rejects it.
See the [world contract](world.md) for permitted actions and task rules.

A passing audit establishes agreement under the reported policy.
It does not establish task success, training improvement, or market value.
The original inspection, template, demo, and appraisal commands remain available.

## Research commands

```sh
node dist/cli.js trace-audit --data snapshot.json --contract contract.json --out trace-audit.json
node dist/cli.js trace-witness --data snapshot.json --contract contract.json --out trace-witness.json
node dist/cli.js trace-pair --source original.json --target renamed.json --contract pair.json
node dist/cli.js trace-holdout --data holdout.json
node dist/cli.js trace-benchmark --seed 7 --repetitions 5
node dist/cli.js world-mdp --task settle-a --seed 7 --horizon 4 --split train --out mdp.json
avalon-python sampling-audit --source examples/sampling/source.json --target examples/sampling/target.json --output sampling-audit.json
avalon-python sampling-witness --source examples/sampling/source.json --target examples/sampling/target.json --sample support-example --position 0 --output token-witness.json
avalon-python sampling-benchmark --seed 7 --output sampling-benchmark.json
```

The trace audit returns `0` for match, `4` for mismatch, and `5` for unknown.
The sampling audit uses the same exit codes for pass, fail, and inconclusive.
Both commands compare supplied evidence with explicit rules.
Neither command proves trainer execution or a correct reward specification.
Sampling witnesses contain raw selected evidence and require a new private output file.
Use the sample identifier and position from the input receipt.

The MDP exporter uses the existing world reducer and a bounded action alphabet.
The horizon ranges from one through six actions.
The default task is `settle-a`, the default seed is `7`, and the default horizon is `4`.
The optional split override changes only experiment metadata.
Trace witnesses retain raw evidence and require a new private output file.
Paired audits check only the declared identifier transformation and transition preservation.
Holdout audits compare the declared groups and hashes. They do not prove when a holdout was frozen.
The [policy experiment](wave2/policy.md) trains on the exported inert tables.
The [sampling guide](wave2/sampling.md) defines captured and unavailable probability evidence.

`avalon-python policy-experiment` accepts repeated `--train`, `--same-family`, and `--family` paths plus a new `--output` directory.
The input inventory must match the frozen experiment plan.
The default plan requires four training tables, eight new-seed tables, and eight held-out family tables.
The command writes the plan and holdout hashes before training.
Its report preserves all conditions and negative results.
