# Avalon 0.8 team trials

This release adds the local first-team workflow to the current Replay source.
The Node package version is 0.8.0. The Python package version is 0.5.0.
The Python version distinguishes the current Replay code from the previously published wheel.

Use `avalon trial init`, `run`, `replay`, and `export` for the SQLite reference workflow.
The project-local agent runtime includes the same templates as the npm package.
Trial execution runs trusted adapter code with user permissions. It is not an operating system sandbox.
See [the trial guide](../../team-trial.md) for setup and limits.

The installer upgrades the reviewed stock 0.7 workflow, selection guide, and Avalon skill.
It retains backups and preserves modified files through the existing installation checks.
New runtime files use the 0.8.0 directory, so the previous runtime remains available.

Local integration checks pass 363 TypeScript tests and 433 Python tests.
Nine Python tests require explicit Docker execution and remain skipped in the default local run.
Hosted validation separately enables those integration tests.
The type, privacy, and agent package checks pass.

The privacy check permits the declared `spawn` import only in the trial process adapter.
Network imports and process imports elsewhere remain rejected.
The security guide describes inherited permissions, private request records, and provider spending limits.

Earlier reference and local-model evidence appears in the [readiness report](../../../experiments/team-trial-readiness.md).
Its measurements precede integration with the newer Replay source and retain their original versions and limits.
The release does not establish customer demand or training improvement.
