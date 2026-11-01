# TypeScript SDK

Build the repository before importing the SDK.
The build removes previous generated files before it emits JavaScript and declarations.
The package exposes types and ESM functions.
Importing the SDK does not start the CLI.

```ts
import { parseSnapshot, auditSnapshots, renderAuditMarkdown } from "avalon-rl";

const source = parseSnapshot(sourceObject);
const target = parseSnapshot(targetObject);
const report = auditSnapshots({ source, target });
const text = renderAuditMarkdown(report);
```

Parse external JSON at the boundary.
Pass the parsed snapshots to the audit functions.
`auditPipeline` compares multiple stages.
`buildWitness` retains private raw evidence for a selected finding.
`auditContamination` checks exact content overlap across declared splits.
The world exports provide deterministic state, replay, verifiers, challenges, and curriculum selection.

## Local package

```sh
npm ci --ignore-scripts
npm run build
npm pack
```

Install the generated archive in a local test project.
The package includes the built JavaScript, type declarations, license, and documentation.
It exposes both `avalon` and `avalon-rl` command names.
The repository does not publish a registry package during this build.
The package keeps the `private` flag to prevent accidental registry publication.

## Candidate selection

Use `parseSelection` to validate a frozen plan and its bound scores.
Pass the result to `selectCandidates` for a fixed-budget Hoeffding comparison.
Read [the selection contract](selection.md) before interpreting its confidence statement.
