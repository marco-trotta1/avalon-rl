# Avalon 0.5 agent workflows

## Delivered behavior

The release adds all 20 reviewed workflows as installable agent skills.
The project installer supports Cursor, Claude Code, and Codex skill directories.
Cursor and Claude project skills use slash invocation. Codex uses its skill menu or `$skill-name`.
The package includes plugin manifests and the shared execution and artifact protocols.

The local runtime discovers conventional project metadata and manages private run records.
It binds declared inputs, records artifact hashes, checks drift, and preserves terminal results.
Completion requires fresh, nonempty artifact evidence. The host supplies that evidence.
Artifact hashes establish byte identity. They do not establish the truth of a scientific claim.

The Python adapter executes bounded NumPy REINFORCE on default CartPole-v1.
It provides checkpoint evaluation, actual probability capture, and a mechanical credit audit.
Checkpoint loading requires the exact adapter source and matching NumPy and Gymnasium versions.
Other trainers require implemented and tested adapters.

## Verification

The isolated source passes 220 Node tests and 257 Python tests, with no skipped Python tests.
The type, privacy, workflow reference, manifest version, and whitespace checks pass.
Native Claude validation passes on Claude Code 2.1.278.
The Cursor manifest passes its official JSON schema with format checks.
The Cursor schema SHA-256 is `31db124b1c7e43c22abb13ebf7e7c74556482e480fd492b80638d815c85b96b1`.

Independent review reproduces three defects before their corrections:

- Altered environment registration changes the reward semantics.
- A checkpoint declares zero updates despite changed parameters.
- A checkpoint supplies an unknown adapter source identity.

All three cases now fail before evaluation. Regression tests retain them.
Other tests cover numerical gradients, actual updates, source capture, malformed inputs, and partial failures.
The package workflow also installs the artifacts and exercises all four new Python commands.
Use the release receipt for the exact commit and hosted workflow results.
The [package smoke record](agent-package-smoke.json) retains the local installation and evidence-handoff checks.

## Fixed execution protocol

The protocol freezes training seeds 7, 101, and 211 before evaluation.
Each run uses 30 episodes, a 200-step cap, learning rate 0.01, and discount 0.99.
Evaluation uses reset seeds 1001 through 1020 and a 500-step cap.
The method performs no evaluation updates or parameter selection.
The complete results remain in [the evidence](agent-gym-evidence.json).

| Training seed | Learned mean return | Random mean return | Simple control mean | Learned minus random, 95% interval |
| --- | --- | --- | --- | --- |
| 7 | 35.45 | 29.0 | 500.0 | 6.45, [-2.80, 16.65] |
| 101 | 29.20 | 29.0 | 500.0 | 0.20, [-8.85, 9.80] |
| 211 | 32.95 | 29.0 | 500.0 | 3.95, [-3.45, 12.25] |

Each mean uses 20 reserved episodes. The unit is undiscounted episode return.
The simple control uses pole angle and angular velocity. It has no training phase.
Each paired bootstrap interval uses 2,000 resamples with bootstrap seed 104729.
The intervals condition on their frozen checkpoints and this task. They do not estimate variation across training seeds or task families.

The runs execute 90 parameter updates across 2,404 training transitions.
The probability capture records 55 actual decisions and passes 715 comparison checks.
The credit audits pass 17,188 checks with no mismatch.
These are exact execution counts. They do not estimate production detection rates.

Training times are 0.0218, 0.0177, and 0.0191 seconds, measured once per invocation on Darwin arm64.
The latency sample size is one per run. No latency interval is available.
The recorded versions are Python 3.13.5, NumPy 2.4.2, and Gymnasium 1.2.3.
External API fees are 0 USD. CPU compute and host-agent costs remain unpriced.

## Limits

The experiment establishes execution and preserves a negative result.
It establishes no gain over random, and every learned candidate loses to the simple control.
It supplies no language-model training result, broad algorithmic novelty, or external user validation.
The host model executes the workflow. The local runtime does not replace the coding agent.
Live host UI discovery and marketplace distribution remain untested.
The release keeps the concurrent reward experiment and private research outside this change.
