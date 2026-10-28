# Security and data handling

Keep real data and source contracts outside the repository.
Do not include private payloads in issues, commit messages, screenshots, or test fixtures.
Use only synthetic fixtures for development and verification.

The production server binds to the loopback address.
Do not expose this server through a proxy, tunnel, or public deployment without a separate security design.
The app has no authentication for remote access.

The app reads JSON and JSONL as data.
It does not execute imported code or follow imported source references.
Its schemas reject unsupported fields.
Each input file has a 10 MiB limit.
Each asset file has a 20,000-record limit.
Diagnostic output contains record positions and fixed reason codes.
It does not contain rejected payload text.

The production Content Security Policy blocks browser connections.
The server uses script hashes for Next.js bootstrap scripts.
The server permits inline styles for layout compatibility.
Do not weaken the script or connection policy to resolve a runtime error.

The app does not persist appraisals in browser storage.
Browser memory release is not secure erasure.
Exports are explicit and remain sensitive.
The aggregate report includes a source SHA-256 for reproducibility.
This fingerprint can reveal a match to a known input file.

The Git ignore rules exclude common data, report, database, archive, and key paths.
The privacy check scans tracked paths and app network and storage APIs.
These controls do not detect every secret or every possible disclosure.
Review the exact staged files before each commit.

No hosted deployment, CI upload, third-party analytics, or external AI service is configured.
Next.js telemetry is disabled in the build and development commands.
Dependency installation and GitHub synchronization use network access.
They do not require real asset data.
