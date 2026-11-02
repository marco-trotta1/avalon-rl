# Capture a failure

A failure case stores the requested behavior, recorded file states, checks, provenance, and data permissions.
The format is `avalon.failure.v1`.
The parser rejects unknown fields.

Keep cases private until the data owner authorizes the intended use.
A rights declaration records an attestation. It does not establish ownership or remove secrets.

## Case fields

| Field | Content |
| --- | --- |
| `format` | `avalon.failure.v1` |
| `id` | A stable case identifier |
| `familyId` | The shared identifier for related cases and variants |
| `title` | A short description |
| `description` | The observed failure |
| `expectedBehavior` | The intended result |
| `provenance` | The source, model identifier, and capture time |
| `rights` | Private status or an authorization attestation |
| `files.initial` | The starting file contents |
| `files.observed` | The recorded agent output |
| `files.reference` | A proposed successful output |
| `checks` | The declared file predicates |

Each snapshot maps relative file paths to UTF-8 text content.
The case does not contain executable commands.
The proposed reference requires review. Its presence does not prove correctness.

The provenance source is `synthetic` or `user`.
Use `synthetic` for authored examples.
Record the model identifier without implying that Avalon verifies its origin.
Use an ISO 8601 timestamp with a timezone for `capturedAt`.

## Declare checks

An `equals` check requires the exact declared string:

```json
{"kind":"equals","path":"answer.txt","expected":"42\n"}
```

An `unchanged` check compares a file with its initial contents:

```json
{"kind":"unchanged","path":"config.json"}
```

Declare one check per file path.
Include the initial file for each `unchanged` check.
A missing output file cannot satisfy either predicate.
Exact text checks can reject valid alternative implementations. Review the predicates for the intended task.
These predicates inspect recorded contents. They do not execute the program or establish functional correctness.

## Record permissions

Private cases use this declaration:

```json
{"status":"private"}
```

An authorization identifies the owner and permitted uses:

```json
{
  "status":"authorized",
  "owner":"Example owner",
  "allowedUses":["evaluation"],
  "attestedAt":"2026-11-01T00:00:00Z"
}
```

The permitted uses are `evaluation`, `training`, and `redistribution`.
Declare each use once.
Evaluation permission does not imply training or redistribution permission.

## Limits and identity

Each snapshot permits 100 files and 1 MiB of UTF-8 content.
Each file permits 65,536 JavaScript string units.
Paths permit 240 characters and portable letters, digits, underscores, hyphens, periods, and directory separators.
Dotfiles are permitted. A segment cannot consist of one or two periods.
The complete case permits 10 MiB of serialized JSON content.
The parser rejects traversal, absolute paths, reserved names, case collisions, and file-directory collisions.

`parseFailureCase` converts unknown input into a typed case.
`failureCaseHash` returns the SHA-256 digest of the canonical parsed case.
Canonicalization sorts object keys and preserves array order.
The digest binds the evidence, checks, provenance, and permissions.
Changing an attestation or a check changes the digest.
The digest establishes content identity. It does not authenticate the contributor.

Keep related cases under one `familyId` when creating development and evaluation splits.
A result on one recorded case does not establish generalization or model improvement.
