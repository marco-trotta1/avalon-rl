# Avalon build run

Date: 2026-10-29.
Base commit: `4f6325d27642b741e0cb3a7f779320430041ab4c`.

## Swarm phases

- [x] Frame. Define the product, the contracts, and the acceptance checks.
- [x] Fan out. Build independent slices in separate worktrees.
- [x] Aggregate. Review the changes and run the complete workflows.
- [x] Report. Publish the PR ledger, evidence, gaps, and the next experiment.

## Product

Avalon is a local laboratory for agent learning worlds.
It compares recorded experience with learner inputs and challenges task verifiers.
It saves reproducible counterexamples and explains what each result can establish.
The existing appraisal commands remain available.

## Assumptions

- Contributions mean useful PRs in the Avalon repository.
- The target is at least 31 PRs with distinct changes and verification.
- Public examples use synthetic data.
- The run uses local compute and free public dependencies.
- No model API spending, customer outreach, or production deployment is required.
- Stars, customer demand, and future revenue remain unvalidated.
- The user excludes all UI and site work on 2026-10-30.

## Done predicate

The public repository contains a complete local workflow and at least 31 traceable PRs.
Each code slice has behavior tests and documentation.
The workflow records, converts, audits, and challenges synthetic experience.
The product exposes a CLI and SDK only.
Reports use JSON, Markdown, or SARIF. No UI or site is in scope.
The report distinguishes controlled faults from defects reproduced in upstream software.
The report includes versions, seeds, input hashes, baselines, time, and evidence limits.

## Shape

Partition the work into independent slices.
Use three workers for the audit engine, Python integration, and the operations world.
The coordinator owns the CLI, reports, packaging, documentation, integration, and PR review.
Workers use separate worktrees and stacked branches.
The coordinator reviews each stack before it enters the default branch.

## Progress

The coordinator reads the strategy, setup, and research chats.
The existing repository has a local appraisal CLI and uncommitted research documents.
The run preserves the research documents without publishing them by default.

## Assembled result

The assembled history includes all 47 constituent PR heads.
The CLI and SDK pass 153 Node tests and 71 Python tests with no Python skips.
Type checking, the source privacy check, and whitespace checks pass.
Two complete Python runs preserve every snapshot and learned-table hash.
The final comparison performs 12 actual CLI audits.
The exact assertion matches Avalon on the 10 injected views and 2 clean views.
No production detection rate or policy improvement is established.

Independent reviews find and correct audit, witness, world, export, and CLI boundary defects.
The hosted Python failure comes from missing local package metadata.
The correction passes hosted run `41084218750`.
The final assembly passes hosted run `41086488823` at commit `8cd2e5145c4ae328ab186d6b6896bcee157848d5`.

The user excludes UI and site work.
The assembly removes the HTML renderer, its export option, and its documentation.
The build removes stale generated files before compilation.

Automatic approval review rejects a bulk retarget operation.
The run preserves the constituent PRs and prepares one complete integration PR instead.
The [ledger](releases/2026-10-30/pr-ledger.md) records each contribution.
The [evidence](releases/2026-10-30/evidence.json) records the measured runs and limits.
