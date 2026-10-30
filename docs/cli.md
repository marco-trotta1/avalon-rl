# Laboratory commands

Build the CLI with `npm run build`.
Run `node dist/cli.js lab-demo` for a synthetic reward mismatch.
Run `node dist/cli.js lab-demo --fault none` for the clean control.
The demonstration always returns exit code `0` when it completes.
The report states whether the injected fault fails the audit.

Compare actual snapshots with this command:

```sh
node dist/cli.js audit --source source.json --target learner.json --out audit.json
```

The audit returns `0` for a pass, `4` for a failure, and `5` for an inconclusive result.
File or data errors return `1`.
Usage errors return `2`.
Use `snapshot --data snapshot.json` for a format summary.
That summary does not compare pipeline stages.

Without `--out`, JSON goes to stdout.
With `--out`, the CLI creates an owner-only file.
It refuses existing files and output symlinks.
Keep the snapshots and reports private.
The commands call no external service.

A passing audit establishes agreement under the reported policy.
It does not establish task success, training improvement, or market value.
The original inspection, template, demo, and appraisal commands remain available.
