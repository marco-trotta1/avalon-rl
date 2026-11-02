# Avalon Replay validation

The local validation runs on November 1, 2026.
The [manifest](validation.json) records the source and fixture hashes.
The [campaign evidence](demo-evidence.json) and [adapter evidence](adapter-evidence.json) preserve actual Docker results.

## Executed demonstration

One authored invoice task contains one development input and two holdout inputs.
The recorded baseline passes zero development inputs and one holdout input.
The alternative repair passes the development input and both holdout inputs.
The overfit candidate passes the development input and neither holdout input.

The reference and positive control pass. The negative control fails as required.
Each snapshot runs once per supplied input. These fixture counts have no population uncertainty estimate.
The campaign takes 3.605 seconds in one measured run.
It retains the immutable image ID and input hashes.
Timing uncertainty is not estimated from one campaign.
Model API cost is zero USD because no model calls occur.
Compute and candidate generation costs remain unpriced.

The separate Gymnasium demonstration executes one development-only step with seed seven.
It returns reward one and terminates the episode. No learner updates occur.

Exact reference-file equality is a deliberately simple alternative baseline.
It rejects the valid repair because its source differs from the reference.
Behavioral checks accept that repair on the supplied inputs.
A handwritten behavioral test can perform the same comparison. No advantage over that method is established.

## Test results

| Check | Result |
| --- | --- |
| Node suite | 346 tests pass |
| Python suite | 354 pass, three Docker tests skip, 78 existing Minari warnings |
| Docker-enabled runner suite | All 23 tests pass, including the three real Docker tests |
| Types, agent package, privacy | All checks pass |
| HTML | Escaping and report content tests pass; visual inspection remains unverified |

The browser preview cannot open the local report because its URL policy blocks file URLs.
No browser policy workaround is used.
The HTML report is available locally for manual review.

The first Docker integration attempt fails because the requested image cannot be resolved.
After the official image is loaded, all real Docker tests pass.
The runner never pulls images during evaluation.

Regression tests first expose remote daemon acceptance and continued execution after unconfirmed cleanup.
The fixes reject remote endpoints, pin local endpoints, and stop later launches when cleanup is uncertain.
Additional regressions cover invalid candidates, non-finite numbers, observation bounds, action bounds, and Gymnasium startup failures.

## Reproduce

```sh
npm test
npm run typecheck
npm run check:agent
npm run check:privacy
PYTHONPATH=python/src AVALON_CLI="$PWD/dist/cli.js" python -m pytest python/tests -q
docker pull python:3.11.15-slim
AVALON_REPLAY_DOCKER=1 PYTHONPATH=python/src python -m pytest python/tests/test_replay_runner.py -q
PYTHONPATH=python/src python -m avalon_lab.replay_cli run \
  --task examples/replay/task.json \
  --candidate repair=examples/replay/repair.json \
  --candidate overfit=examples/replay/overfit.json \
  --output /tmp/replay-validation-new
```

The mixed campaign returns exit code four because the overfit candidate is rejected.
Use the tested Python dependencies for the complete Python suite.
These runs use Node 22.22.3, Python 3.13.5, and the recorded Python container image.

## Limits

The fixtures are synthetic and authored. They do not come from an independent customer failure.
The task tests a Python function. It does not cover arbitrary repositories or enterprise systems.
The harness output is not authenticated against a malicious candidate.
No model improvement, paid demand, generalization, or scientific novelty is established.
