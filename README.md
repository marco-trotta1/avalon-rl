# TraceAtlas

TraceAtlas is a local command-line script for RL environments and data traces.
It inspects data and estimates licensing or sale prices from documented comparable transactions.
The repository is private. The software license is proprietary.

The script has no web interface, server, external AI service, or telemetry.
The synthetic demonstration uses invented assets, transactions, and prices.
The repository does not contain a real transaction database.

## Setup

Use Node.js 22.12 or later.
Package installation requires network access. Analysis uses local files.

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js --help
```

## Inspect data

Use inspection when you do not have a deal ledger.
The report contains structural checks and counts. It does not contain a price.

```sh
node dist/cli.js inspect --kind traces --data /private/path/traces.jsonl
node dist/cli.js inspect --kind environment --data /private/path/environment.json
```

## Estimate a license or sale price

Generate a blank appraisal file. Enter the asset scope, provenance evidence, transfer rights, and comparable transactions.
Store actual files outside this repository.

```sh
node dist/cli.js template --kind traces --out /private/path/appraisal.json
node dist/cli.js appraise --case /private/path/appraisal.json --data /private/path/traces.jsonl
```

The appraisal file selects the asset type.
For an environment, use an environment appraisal file and a task manifest.
The same command handles non-exclusive licenses, exclusive licenses, and ownership sales.
See [the input formats](docs/formats.md) for the complete contract.

## Save a private report

Shell redirection uses the shell's file permissions. Use `--out` for an owner-only report file.
The output directory must exist. The script never replaces an existing file or follows an existing output symlink.

```sh
node dist/cli.js appraise --case /private/path/appraisal.json --data /private/path/traces.jsonl --out /private/path/report.json
```

Without `--out`, the script writes JSON to stdout.
With `--out`, it creates a file with mode `0600` and writes a fixed confirmation to stderr.
The report omits raw observations, actions, asset names, deal identifiers, and contract references.
It includes counts, a source SHA-256, terms, prices, and transaction inclusion decisions.
Transaction record numbers refer to the original comparable array, starting at 1.
Keep reports private.

## Try synthetic data

```sh
node dist/cli.js demo --kind traces
node dist/cli.js demo --kind environment
```

These commands do not require input files. Their prices are invented and remain marked as synthetic.
The `npm run analyze --` command also accepts these subcommands.
Use `node dist/cli.js` directly when you need JSON without npm status messages.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Inspection, appraisal, template generation, or demonstration completes |
| `1` | A file, encoding, output, or data error prevents completion |
| `2` | The command arguments are invalid |
| `3` | Inspection completes, but the evidence does not support a price |

Exit code `3` still produces a structured report with the evidence gaps.
Invalid individual records appear as inspection exclusions.
They do not cause a file error when the remaining input can be inspected.

## Method

The named simple baseline is the median of matching transaction unit prices.
The estimate multiplies that median by the inspected eligible volume.
The observed minimum and maximum unit prices produce the reported range.
This range is not a confidence interval. Every result remains provisional.

The model requires:

- At least 3 completed transactions from distinct counterparty groups.
- Matching asset type, domain, modality, intended use, rights, and license term.
- A closed contract or paid invoice with an attested document review.
- Transaction dates within 365 days of the appraisal date.
- Comparable volumes between 0.25 and 4 times the inspected subject volume.
- Documented provenance and transfer rights for the requested transaction.

These thresholds are product policies. They are not statistically calibrated.
The model assumes linear unit pricing.
It does not infer bundle discounts, scarcity premiums, exclusivity premiums, or training value.
Quotes and asking prices do not enter the estimate.
The script does not verify contracts, source documents, rights, or counterparty independence.
See [the method and sources](docs/method.md) and [the validation record](docs/validation.md).

## Inspection limits

Trace inspection checks aligned arrays, finite rewards, final episode flags, and exact duplicate content.
Conflicting identifiers and incomplete episodes do not enter the priced volume.
Termination and truncation remain distinct. Neither proves task success.

Environment inspection checks task specifications and declared passing test receipts.
The script does not execute environment code or verify the receipts.
It does not prove reset correctness, reward integrity, runtime performance, or reproducibility.

Each input file has a 10 MiB limit. Each asset file has a 20,000-record limit.
Native HDF5, Arrow, Parquet, video, and arbitrary agent logs require a separate JSON export.
The script does not measure semantic novelty, benchmark contamination, downstream training improvement, or real market accuracy.

## Privacy

Input contents remain in process memory. Only stdout or an explicit `--out` receives a report.
The script does not call external services, run imported code, start a server, or write automatic logs.
It rejects invalid UTF-8 and bounds each input read.
File errors do not print input paths or rejected payloads.
Process exit releases memory. It does not guarantee secure memory erasure.
See [the security notes](SECURITY.md).

## Verify changes

```sh
npm run test:cli
npm run test:engine
npm run typecheck
npm run check:privacy
```

Run `npm test` before a commit. It builds the script and runs all engine and CLI tests.
The CLI tests use synthetic fixtures and disable Node network APIs during the main workflows.
The privacy source check is a guard. It is not a complete security audit.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | Commands, bounded file reads, private output, and exit codes |
| `src/lib/schema.ts` | Validated input formats |
| `src/lib/engine.ts` | Inspection, transaction selection, pricing, and aggregate reports |
| `src/lib/demo.ts` | Deterministic synthetic fixtures |
| `tests/` | Engine and CLI checks |
| `docs/` | Formats, sources, limits, and validation |
| `dist/` | Generated script output, excluded from Git |

The model version remains `comparable-median-v1`.
