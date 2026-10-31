# Security and data handling

Keep real data, deal ledgers, reports, and source contracts outside the repository.
Do not include private payloads in issues, commit messages, screenshots, or test fixtures.
Use synthetic fixtures for development and verification.

The CLI reads local JSON and JSONL as data.
It has no web interface, server, telemetry, external AI service, or runtime network client.
The data audits do not follow source references or execute user-provided programs.
Its schemas reject unsupported fields.
Snapshots and appraisal inputs have a 10 MiB limit.
Saved audit reports have a 256 MiB limit and a 500,000-finding limit.
Each reader stops at its limit plus one overflow detection byte.
Each asset file has a 20,000-record limit.
The reader rejects invalid UTF-8 and non-regular input files.

The CLI writes JSON, Markdown, or SARIF to stdout unless an output path is supplied.
Terminal capture and shell redirection can retain stdout.
Use `--out` to create report files with mode `0600`.
The output directory must exist.
Audit outputs use exclusive file creation and never replace an existing output path.
This also rejects an output symlink or an output path that names an input file.
Audit file errors omit input paths and rejected payloads.
Python exceptions can include local paths and field identifiers.
Keep terminal logs private.

Audit reports omit raw observations, actions, and episode IDs.
They retain counts, fingerprints, producer labels, and source or target ordinals.
Appraisal reports also retain terms, prices, and transaction decisions.
Transaction record numbers map to the supplied ledger.
The SHA-256 can reveal a match to a known source file.
Keep reports private.

Witnesses contain selected raw evidence.
The CLI requires an explicit owner-only output file for a witness.
Never upload a private witness as a public reproducer.

The Python recorder supports a documented list of built-in Gymnasium environments.
Local Minari export requires HDF5 and supported serialized built-in spaces.
It bypasses automatic environment recovery and the extensible space deserializer.
The Python comparison starts only the Node CLI path that the user explicitly supplies.
It passes arguments directly and uses no shell command interpolation.

The script keeps input contents in process memory until the run ends.
Memory release does not guarantee secure erasure.
Device administrators, malware, and terminal capture remain outside this protection.

The Git ignore rules exclude common data, report, database, archive, and key paths.
The privacy check scans tracked paths, runtime source APIs, and package dependencies.
The CLI tests block Node network APIs during the main workflows.
These checks do not replace an operating system sandbox or a security audit.
Review the exact staged files before each commit.

No hosted product, experience upload, analytics, or external AI service is configured.
Agent skills use the host model, execution tools, research tools, and permissions.
They can instruct the host to inspect or change project code and execute tests or training.
The local runtime does not grant additional execution or publication permissions.
Host permissions and resource controls remain necessary for those actions.

Agent run records contain goals, project paths, messages, hashes, and selected evidence.
Agent operation errors can include local paths. Keep their logs private.
Agent installation includes a private Node runtime under `.avalon/runtime/VERSION`.
The runtime includes production JavaScript, skill source, the declared Zod dependency, and their licenses.
Installation preflights all files and preserves differing local content.
The installer replaces the exact known 0.5 shared protocol when its complete hash matches the shipped version.
It rejects a locally edited protocol. Other differing files remain protected.
Stock upgrades retain the actually displaced file in a private backup directory.
Publication uses an exclusive link and never replaces a recreated target.
If concurrent editing prevents restoration, the error names the retained backup for inspection.
Keep `.avalon` private. The installer does not make these records suitable for publication.
Review the allowed artifacts before a release.
The built-in Gymnasium trainer uses a declared CPU budget and creates new output files.
It loads data-only checkpoints and does not load arbitrary model code.

GitHub CI runs the code on synthetic fixtures and retains ordinary job logs.
Dependency installation and GitHub synchronization use network access.
They do not require real asset data.
