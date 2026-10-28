# Security and data handling

Keep real data, deal ledgers, reports, and source contracts outside the repository.
Do not include private payloads in issues, commit messages, screenshots, or test fixtures.
Use synthetic fixtures for development and verification.

The CLI reads local JSON and JSONL as data.
It has no web interface, server, telemetry, external AI service, or runtime network client.
It does not execute imported code or follow source references.
Its schemas reject unsupported fields.
Each input read stops after 10 MiB plus one overflow detection byte.
Each asset file has a 20,000-record limit.
The reader rejects invalid UTF-8 and non-regular input files.

The script writes JSON to stdout unless an output path is supplied.
Terminal capture and shell redirection can retain stdout.
Use `--out` to create report files with mode `0600`.
The output directory must exist.
The script uses exclusive file creation and never replaces an existing output path.
This also rejects an output symlink or an output path that names an input file.
File error messages omit input paths and rejected payloads.

Reports omit raw observations, actions, asset names, deal identifiers, and contract references.
They retain sensitive counts, a source fingerprint, terms, prices, and transaction decisions.
Transaction record numbers map to the supplied ledger.
The SHA-256 can reveal a match to a known source file.
Keep reports private.

The script keeps input contents in process memory until the run ends.
Memory release does not guarantee secure erasure.
Device administrators, malware, and terminal capture remain outside this protection.

The Git ignore rules exclude common data, report, database, archive, and key paths.
The privacy check scans tracked paths, runtime source APIs, and package dependencies.
The CLI tests block Node network APIs during the main workflows.
These checks do not replace an operating system sandbox or a security audit.
Review the exact staged files before each commit.

No hosted deployment, CI upload, analytics, or external AI service is configured.
Dependency installation and GitHub synchronization use network access.
They do not require real asset data.
