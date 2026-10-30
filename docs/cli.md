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
Use `snapshot --data snapshot.json` for a format summary.
That summary does not compare pipeline stages.

Without `--out`, JSON goes to stdout.
With `--out`, the CLI creates an owner-only file.
It refuses existing files and output symlinks.
Keep the snapshots and reports private.
The commands call no external service.

## Offline report

```sh
node dist/cli.js lab-demo --format html --out audit.html
node dist/cli.js audit --source source.json --target learner.json --format html --out audit.html
```

Open the HTML file in a browser.
Filter the findings by text or severity.
Expand the field fingerprints to compare the source and target.
The report includes no raw observations or actions.
It uses no external scripts, fonts, or services.
It retains producer labels, counts, and fingerprints.
Keep the report private.

## Portable exports

```sh
node dist/cli.js report --data audit.json --format markdown --out audit.md
node dist/cli.js report --data audit.json --format sarif --out audit.sarif
```

The `report` command checks that the saved summary agrees with its findings.
It returns `0` when the export completes, including exports of failing audits.
SARIF uses version `2.1.0` and preserves rule IDs, severity, and field fingerprints.
The CLI does not upload the SARIF file.
Markdown escapes supplied labels and messages.
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
