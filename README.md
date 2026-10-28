# TraceAtlas

TraceAtlas estimates the licensing or sale price of RL environments and data traces.
It runs locally and processes files inside the browser.
The repository is private. The software license is proprietary.

The estimate uses documented comparable transactions supplied by the user.
The app does not contain a real transaction database.
The synthetic demonstration uses invented assets, transactions, and prices.

## Run locally

Use Node.js 22.12 or later.
Package installation requires network access. Asset analysis does not require network access.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open [the local workspace](http://127.0.0.1:4317).
Use the production server for the restrictive network policy.
The development command is `npm run dev`.
The development server supports local development connections.

## Create an appraisal

1. Select Data traces or RL environment.
2. Download the appraisal template.
3. Enter the asset scope, provenance evidence, transfer rights, and comparable deals.
4. Import the appraisal JSON.
5. Import the trace JSONL or environment JSON.
6. Inspect the estimate, excluded deals, and data diagnostics.
7. Download the private aggregate report if required.
8. Clear the session when the work is complete.

Keep real datasets, deal ledgers, and contracts outside this repository.
The exported report contains sensitive counts, a source fingerprint, terms, and prices.
It omits raw observations, actions, names, deal identifiers, and contract references.

See [the input formats](docs/formats.md) for the complete contract.

## What the estimate means

The model calculates a median transaction price per eligible unit.
It multiplies this price by the inspected asset volume.
The unit is a complete trace episode or a documented environment task specification.
Comparable unit counts must use the same eligibility definition.

The observed minimum and maximum comparable prices define the displayed range.
The range is not a confidence interval.
No coverage probability is claimed.
Every result remains provisional.

The model requires:

- At least 3 matching transactions from distinct counterparty groups.
- A closed contract or paid invoice with an attested document review.
- Matching asset type, domain, modality, intended use, rights, and license term.
- A transaction date within 365 days of the appraisal date.
- Comparable volumes between 0.25 and 4 times the inspected subject volume.
- Documented provenance and transfer rights for the requested transaction.

The date, volume, and evidence thresholds are product policies.
They are not statistically calibrated.
The model assumes linear unit pricing.
It does not infer bundle discounts, scarcity premiums, exclusivity premiums, or training value.
It never converts an asking price or quote into a completed transaction.
It does not mix ownership sales with licenses.

The ledger author attests to the transaction evidence and counterparty grouping.
The app does not verify contracts, source documents, rights, or counterparty independence.
The document hash identifies the declared source. It does not prove the source is authentic.
Missing evidence withholds a price.

See [the method and sources](docs/method.md) for the evidence boundaries.

## Inspection scope

Trace inspection checks aligned arrays, finite rewards, final episode flags, and exact duplicate content.
Termination and truncation remain distinct. Neither proves task success.
Conflicting identifiers exclude the affected records.
Invalid and incomplete records do not enter the priced volume.

Environment inspection checks task specifications and declared passing test receipts.
The analyzer does not execute environment code or verify the receipts.
It does not prove reset correctness, reward integrity, runtime performance, or reproducibility.

Native Minari HDF5, Arrow, Parquet, video, and arbitrary agent log formats require a separate JSON export.
The app does not detect semantic duplicates, hidden personal data, or benchmark contamination.
It does not train models or compute Data Shapley values.

## Privacy

The app has no upload endpoint, account, database, external model API, or analytics.
It does not use browser storage.
Appraisal state remains in session memory.
Clear session releases app references. It does not guarantee secure memory erasure.

The production server:

- Binds to `127.0.0.1:4317`.
- Rejects unexpected Host headers and upload methods.
- Blocks browser network connections with `connect-src 'none'`.
- Allows only local scripts and approved inline script hashes.
- Disables framing, forms, device permissions, and response caching.

External research links open only when selected.
They receive no referrer from the app.
Device administrators, browser extensions, malware, and screen capture remain outside this protection.
No hosted deployment is configured.

## Verify changes

```sh
npm run test:engine
npm run typecheck
npm run check:privacy
npm run build
npm run test:browser
```

Install Chromium with `npx playwright install chromium` if Playwright cannot find it.
The browser tests use the production server and synthetic fixtures.
They check file imports, both asset types, report export, responsive layout, and blocked network access.
The privacy source check is a guard. It is not a complete security audit.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/lib/schema.ts` | Validated boundary formats |
| `src/lib/engine.ts` | Asset inspection, transaction selection, pricing, and aggregate export |
| `src/lib/demo.ts` | Deterministic synthetic fixtures |
| `src/app/` | Local browser interface |
| `scripts/serve.mjs` | Restricted local production server |
| `tests/` | Engine and browser checks |
| `docs/` | Formats, sources, limits, and validation record |

The first model version is `comparable-median-v1`.
