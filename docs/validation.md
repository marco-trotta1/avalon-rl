# Validation record

Date: 2026-10-28.
Scope: command-line implementation with synthetic fixtures.
No real datasets, contracts, or completed transactions are used.

## Environment

| Component | Version |
| --- | --- |
| Node.js | 22.22.3 |
| npm | 10.9.8 |
| TypeScript | 7.0.2 |
| Zod | 4.6.7 |
| Vitest | 5.0.5 |

The package lock records the dependency graph.
The fixtures use deterministic integer indexes. They do not use a random seed.
The fixture appraisal date is 2026-10-27.
The trace fixture SHA-256 is `f83f400516d76e73601b32c6a0fc32a653aa6c7e65cb650f1bcb8d656acaf07e`.

## Checks

| Check | Result |
| --- | --- |
| Full Vitest suite | 30 tests pass |
| Engine suite | 16 tests pass |
| CLI integration suite | 14 tests pass |
| TypeScript check | Passes |
| CLI build | Passes |
| Privacy source check | Passes |

The CLI checks cover both asset types, ownership sales, inspection without a ledger, templates, and synthetic demonstrations.
They verify that redacted transaction decisions preserve the original ledger record positions.
They check structured exit code 3 when pricing evidence is missing.
The tests verify mode `0600`, refusal to replace existing files, and input file preservation.
They reject missing files, oversized inputs, invalid UTF-8, and invalid arguments.
The tests verify that file errors omit input paths.

The main workflows run with HTTP, TCP, UDP, TLS, fetch, and server creation APIs replaced by throwing stubs.
The workflows complete with these stubs.
This test guard is not an operating system sandbox.

## Synthetic baseline

The named baseline is the unweighted median of matching transaction unit prices.
The trace fixture has 260 records: 240 eligible episodes, 12 duplicates, 6 incomplete episodes, and 2 invalid records.
The eligible episodes contain 480 steps and 8 declared task identifiers.

The 5 invented comparable unit prices are USD 42, 55, 62.50, 75, and 91 per episode.
The median estimate is USD 15,000 for 240 eligible episodes.
The observed range is USD 10,080 to 21,840.
This range has no claimed statistical coverage.

The leave-one-out median absolute percentage error is 25.0%, with n=5 synthetic held-out transactions.
The model and baseline are the same calculation. No improvement over the baseline is claimed.
No real-market accuracy or confidence interval is measured.
No paid model API runs. Device cost, energy use, and analysis latency are not measured.

The environment fixture has 12 distinct task specifications with declared passing test receipts.
The 5 invented comparable prices have a median of USD 1,100 per task specification.
The synthetic environment estimate is USD 13,200.
The analyzer does not verify the declared receipts or execute the environment.

## Negative results and repairs

The initial export assertion matches the substring `actions` inside `transactions`.
The assertion changes to exact JSON field names.
This failure does not reveal a raw payload export.

A duplicate regression initially counts 2 equivalent episodes instead of 1.
Language collation gives distinct object keys the same ordering rank.
The canonical serializer changes to deterministic code-unit ordering.
The regression then counts 1 eligible episode and 1 duplicate.

The initial CLI help regression returns exit code 1 before the entry point exists.
The implemented command returns exit code 0.
An initial shared command tag prevents TypeScript from narrowing file arguments.
Separate command variants resolve the compile errors.

The earlier interface validation remains in commit `9ae313d`.
Those browser checks do not verify the current command-line implementation.

## Unverified work

The implementation has no independent security audit or real-market calibration.
It does not verify source documents, licenses, counterparty independence, or test receipts.
It does not measure downstream training improvement, semantic novelty, or benchmark contamination.
It does not support native HDF5, Arrow, Parquet, video, or arbitrary agent logs.
No public or private hosted deployment is configured.
