# Validation record

Date: 2026-10-28.
Scope: local implementation with synthetic fixtures.
No real datasets, contracts, or completed transactions are used.

## Environment

| Component | Version |
| --- | --- |
| Node.js | 22.22.3 |
| npm | 10.9.8 |
| Next.js | 16.4.3 |
| React | 19.3.1 |
| TypeScript | 7.0.2 |
| Zod | 4.6.7 |
| Vitest | 5.0.5 |
| Playwright | 1.64.1 |

The package lock records the dependency graph.
The fixtures use deterministic integer indexes. They do not use a random seed.
The fixture appraisal date is 2026-10-27.
The trace fixture SHA-256 is `f83f400516d76e73601b32c6a0fc32a653aa6c7e65cb650f1bcb8d656acaf07e`.

## Checks

| Check | Result |
| --- | --- |
| Full Vitest suite | 16 tests pass |
| Playwright production suite | 7 tests pass |
| TypeScript check | Passes |
| Production static build | Passes |
| Privacy source check | Passes |
| Desktop visual inspection | Reviewed at a 1440 by 1100 CSS pixel viewport |
| Mobile visual inspection | Reviewed at a 390 by 844 CSS pixel viewport |

The browser checks cover file import, report export, session clearing, and both asset types.
They cover matching ownership sale transactions and withholding prices when evidence is missing.
The tests observe no network requests during the synthetic import, analysis, and export workflows.
The production policy blocks a test outbound request.
The server rejects upload methods and an unexpected Host header.
The mobile check finds no document overflow at the tested viewport.

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

The initial browser runner cannot bind the local test server inside the sandbox.
The authorized local test run uses the required host permissions.

The visual review finds a missing icon asset.
A regression request returns HTTP 404 before the repair.
The app adds a local SVG icon and metadata reference.
The production check then returns HTTP 200.

## Unverified work

The implementation has no independent security audit or real-market calibration.
It does not verify source documents, licenses, counterparty independence, or test receipts.
It does not measure downstream training improvement, semantic novelty, or benchmark contamination.
It does not support native HDF5, Arrow, Parquet, video, or arbitrary agent logs.
No public or private hosted deployment is configured.
