# Input formats

All files use UTF-8.
Each file must not exceed 10 MiB.
Unsupported fields fail validation.
Store actual inputs outside the repository.

## Appraisal JSON

Generate a blank template with `node dist/cli.js template --kind traces`.
Use `--kind environment` for an environment appraisal.
Use `schemaVersion: 1` and `evidenceMode: "user-supplied"` for actual appraisals.
Keep synthetic examples in `synthetic` mode.

| Field | Meaning |
| --- | --- |
| `asOfDate` | Appraisal date in `YYYY-MM-DD` format |
| `asset.name` | Private asset label |
| `asset.kind` | `traces` or `environment` |
| `asset.domain` | Lowercase category slug, such as `software-operations` |
| `asset.modality` | `tool-use`, `text`, `robotics`, `simulation`, or `browser` |
| `asset.use` | `training`, `evaluation`, or `training-and-evaluation` |
| `asset.rights` | Requested transaction rights |
| `asset.provenance` | Provenance documentation status |
| `asset.transferRights` | Documentation for the requested license or ownership sale |
| `comparables` | Up to 2,000 transaction records |

A documented evidence object is `{"status":"documented","reference":"private-source-reference"}`.
Other statuses are `{"status":"unknown"}` and `{"status":"restricted"}`.
A documented status is an author assertion. The script does not verify the reference.
Transfer documentation must cover the exact requested rights and any existing license restrictions.

Use one rights object:

```json
{"type":"nonexclusive","termMonths":12}
```

```json
{"type":"exclusive","termMonths":12}
```

```json
{"type":"assignment"}
```

Set `termMonths` to `null` for a perpetual license.
Ownership assignment has no license term field.
The model does not convert between these rights.

## Comparable transactions

Each comparable repeats the asset scope fields: `kind`, `domain`, `modality`, `use`, and `rights`.
All prices use USD. Currency conversion is not supported.

| Field | Meaning |
| --- | --- |
| `id` | Unique private deal identifier |
| `currency` | Exactly `USD` |
| `units` | Positive integer count of eligible episodes or documented task specifications |
| `totalUsd` | Positive transaction amount, excluding taxes, support, and unrelated services |
| `date` | Completed transaction date |
| `counterpartyGroup` | Common identifier for affiliated buyers in the same economic group |
| `evidence.type` | `closed-contract`, `paid-invoice`, `asking-price`, or `quote` |
| `evidence.reference` | Local contract or invoice reference |
| `evidence.documentSha256` | Lowercase 64-character source document SHA-256 |
| `evidence.reviewer` | Person who reviews the source |
| `evidence.reviewedOn` | Review date, on or after the transaction date |

Use completed prices for equivalent rights and eligible units.
Do not use a whole environment bundle price as a task price.
Separate hardware, consulting, support, and compute services from the asset price.
Use the same inspection definition for the comparable volume and subject volume.
The script cannot verify this normalization.

Only completed transactions enter the estimate.
Quotes and asking prices appear as excluded evidence.
Duplicate deal identifiers exclude every record with that identifier.
The selector processes the newest eligible deals first.
It accepts one source document and one counterparty group each.
Group comparisons ignore letter case.

## Trace JSONL

Each nonblank record contains one episode:

```json
{"episode_id":"example-1","task_id":"task-a","observations":[{"state":0},{"state":1},{"state":2}],"actions":[{"tool":"read"},{"tool":"write"}],"rewards":[0,1],"terminations":[false,true],"truncations":[false,false]}
```

The `observations` count must equal the `actions` count plus 1.
The other arrays must equal the `actions` count.
Each episode supports up to 10,000 actions.
Observation and action values must be non-null JSON.
Rewards must be finite numbers.
Episode and task identifiers must be nonempty strings.

The last step must terminate or truncate for the episode to enter the priced volume.
Earlier steps must not terminate or truncate.
The analyzer does not infer task success from rewards or final flags.
Both flags may be true at the final step.
The report can therefore count one episode in both ending categories.

Duplicate detection hashes the canonical observation, action, reward, termination, and truncation arrays.
It excludes episode and task identifiers from this hash.
Equivalent object key orders produce the same hash.
Changed labels do not make an identical episode new.
Semantically similar episodes can still count as distinct.

Different valid content under one episode identifier excludes every affected record.
Blank lines do not count as records.
Diagnostic positions refer to nonblank records, not physical line numbers.

## Environment JSON

The environment file contains `schemaVersion`, `environment_id`, `version`, and `tasks`.
Each task uses this structure:

```json
{
  "id": "example-task",
  "instruction": "Resolve the synthetic ticket.",
  "initial_state": {"ticket": 1, "status": "open"},
  "reset": "Restore the initial ticket state.",
  "verifier": {
    "type": "programmatic",
    "definition": "ticket.status === 'resolved'"
  },
  "test_receipt": {
    "passed": 10,
    "total": 10,
    "documentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

The verifier type is `programmatic` or `rubric`.
The initial state must be non-null JSON.
The test receipt is optional for inspection.
The task enters the priced volume only when all declared tests pass.
The total test count must be positive.

The analyzer hashes the task instruction, initial state, reset definition, and verifier.
It ignores the task identifier and test receipt when detecting duplicate definitions.
It does not execute the verifier, reset code, or environment.
It does not verify a declared test receipt against a source document.

## Aggregate report

The appraisal JSON output uses format `traceatlas-aggregate-v1`.
It records the model version, input SHA-256, counts, rights, prices, policy settings, and limits.
It removes raw observations, actions, asset names, deal identifiers, and source references.
It retains the synthetic marker when the scriptraisal uses synthetic evidence.
Keep this report private.
