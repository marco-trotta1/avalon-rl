---
name: rl-release
description: "Review, package, test, and deliver a verified RL environment, policy, or dataset with evidence under the configured publication policy."
---

# /rl-release

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Deliver the exact tested artifact with accurate claims and permitted contents.

## Discover

1. Read the release destination, publication policy, intended artifact, license, evaluation evidence, and existing authorization.
2. Inspect the package allowlist and determine which source, data, model, and documentation belong in the release.
3. Identify private raw traces, witnesses, local paths, credentials, and restricted data.

## Execute

1. Review the final source diff and the claims that accompany the artifact.
2. Run the required source, regression, privacy, installation, and artifact checks.
3. Build packages in a clean workspace and record source identity and package hashes.
4. Install the built artifact into an empty project and exercise the relevant commands.
5. Write the task or model card with training data scope, baselines, evaluation, costs, known failures, and unsupported uses.
6. Exclude raw private data and local machine metadata unless explicitly permitted.
7. Publish to the configured destination within existing authorization.
8. If authorization or the destination is missing, prepare the tested artifact and request only the missing decision.
9. Record the published version, destination, exact hashes, and validation receipt.

## Verify

1. Check that the published bytes match the tested package hashes.
2. Check installation from the delivered artifact rather than the source checkout.
3. Disclose whether host UI loading, external training, or production behavior remains unverified.
4. Do not claim training improvement or broad novelty from packaging success.

## Deliver

- Installable environment, policy, dataset, or agent package.
- Task or model card and release notes.
- release.json: version, destination, source, package hashes, and validation references.

## Capability boundary

Avalon packages its local runtime and skills. New distribution targets need destination-specific installation and execution checks.
