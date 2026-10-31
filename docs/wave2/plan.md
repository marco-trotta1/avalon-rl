# Avalon wave 2

Date: 2026-10-30.
Starting release: `e80dd4b`.
Scope: local CLI, SDK, and installable release artifacts.

## Assumptions and authorization

The user authorizes reviews, conflict fixes, merges, deployment, and approximately 30 new PRs.
The user also authorizes an every-minute background loop after the current run.
Deployment means a verified CLI archive and Python wheel on GitHub Releases.
The project has no service or site to deploy.
Private research files remain outside the public changes.
No paid training, outreach, or customer data access is in scope.

## Research method

The source is [Alpha generation p1](https://docs.google.com/document/d/14qXSLPBZENOTmYJMJPQ7xFRtMzm00qCF9foTKqque70/edit?tab=t.yanuzg92m04x).
Each research iteration selects one lead, reads primary evidence, saves the result, and selects the next lead.
Separate workers inspect trainer boundaries and verifier learning.
Both workers preserve disconfirmation and existing alternatives.
The [scratchpad](research/scratchpad.md) records the next decision.

## Decision before implementation

The [trainer research](research/trainer-boundaries.md) finds a finite probability counterexample.
Identical selected-token probabilities can hide different supports and different gradient updates.
A complete-support assertion detects the same case.
The candidate benefit is a portable diagnosis with explicit missing evidence.
No live trainer integration, model gain, or novelty is established.

The [verifier research](research/verifier-learning.md) selects history-aware reward checks.
A final-state check can accept a prohibited change after an agent restores its effect.
The next experiment trains a real tabular policy under three reward rules.
It compares fixed, random, and training-only disagreement schedules under the same budget.
Evaluation reserves task families and seeds before training.

## Independent implementation lanes

1. Add ten sampling-forensics slices, including the independently reproduced membership correction.
2. Add ten trace-contract slices, including the independently reproduced horizon and optional-field corrections.
3. Add eight policy slices with real updates, held-out evaluation, and paired seed statistics.
4. Add six integration slices for research, commands, experiment composition, packaging, measured evidence, and public metadata protection.

Each PR must expose a separate behavior and include a focused check.
The review corrections and public metadata protection bring the wave to 34 focused PRs.
The coordinator reviews each change before merging it into main.
The count is a target. Failed experiments remain useful results.
No claim requires a positive outcome to remain in the report.

## Evidence gates

Freeze the receipt contracts, generator, reward rules, holdouts, and budgets before scoring.
Preserve context, token identity, ending signals, remaining horizon, and prohibited history.
Keep reward labels and evaluation verdicts outside policy observations.
Compare the sampling audit with selected-logprob equality and complete-support equality.
Compare policy training with random actions and a known-good ceiling.
Report exact fixture counts separately from seed-cluster estimates.
Record versions, seeds, hashes, wall time, memory, API charges, and unpriced local compute.
Do not infer demand, broad novelty, or production error rates from these experiments.

## Verification and release

Run the narrow test first. Observe a failing regression before each bug correction.
Run the Node and Python suites before each commit or PR.
Run the type, privacy, and whitespace checks before publication.
Verify the exact merged head in hosted CI.
Install each release artifact in a clean temporary directory.
Publish the artifact hashes and the measured limits with the release.
Stop the background loop after the release verification completes.
