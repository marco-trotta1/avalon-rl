# Contribute to Avalon

Start with one data boundary, counterexample, task family, or independent verifier.
Use synthetic fixtures in public changes.
Keep private snapshots, witnesses, contracts, and customer data outside Git.

## Set up

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js lab-demo --fault none
```

Use the main README for Python installation.
Install the local Python package as well as its tested dependencies.
Its distribution metadata supplies the recorded Avalon version.

## Add an adapter

Pin the source and target versions.
Export the [snapshot contract](docs/snapshots.md) at both boundaries.
Preserve final observations, separate ending signals, bootstrap semantics, and per-episode context.
Include a clean control and a controlled fault.
Compare the adapter with a simple exact assertion.
State whether a removed field follows an explicit conversion policy.
Do not label every deliberate transformation as a defect.

## Add a world contribution

Define the state, actions, task assumptions, authority, and expected outcome.
Include a known-good solution and a deliberately wrong solution.
Use an independently implemented check when possible.
Preserve the counterexample and describe the limits of its independence.
Keep task families separate across training and evaluation when the experiment requires a holdout.

## Verify the change

Run the narrow test that covers the behavior first.
For a bug fix, observe the regression fail before the correction.
Before a commit or PR, run:

```sh
npm test
npm run typecheck
npm run check:privacy
AVALON_CLI="$PWD/dist/cli.js" .venv/bin/python -m pytest python/tests -q
```

The Python comparison requires the built CLI path.
Do not claim a passing integration test when it skips.
Use a Conventional Commit subject.
Keep each PR focused on one observable result.

For a measurement, record the method, baseline, seed, hashes, versions, sample count, latency, cost, and uncertainty.
Retain failed experiments.
Distinguish controlled faults from reproduced upstream defects and real outcomes.

The issue templates accept reproducible failures and adapter proposals.
No UI or site work is in scope for this release.
