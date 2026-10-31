# Measured results

Date: 2026-10-30. Package versions: `avalon-rl` 0.4.0 and `avalon-rl-lab` 0.2.0.

The history reward produces 160/160 valid same-family outcomes with the fixed schedule, versus 140/160 for the final-state reward.
The paired difference is 12.5 percentage points, with a conditional 95% interval from 5.0 to 22.5 percentage points.
The experiment shows no curriculum gain and no transfer advantage to the held-out ticket family.
Sampling and trace audits tie their strongest simple assertion baselines.
These are synthetic results. They establish no production benefit or broad novelty.

[The evidence file](evidence.json) preserves all 180 seed-condition records, 18 paired comparisons, control metrics, finite cases, hashes, versions, and limits.
It excludes raw observations, raw update records, and policy weights.
Public artifact references contain names and hashes. They exclude local filesystem paths.

## Learned policies

The frozen plan uses 20 learner seeds, three reward arms, three schedules, and 2400 training actions per condition and seed.
Each row below contains 160 evaluation episodes per partition, grouped into 20 learner-seed clusters.
Training uses four invoice tables at generator seeds 7 and 8.
Same-family evaluation uses eight invoice tables at seeds 1007 through 1010.
Family evaluation uses eight ticket tables at seeds 2007 through 2010.
The plan fixes horizon 4, learning rate 0.3, discount 0.95, and epsilon 0.2.
It executes 432000 recorded Q updates across 180 seed-condition runs.

The final public CLI run takes 21263.738875 ms, n=1, and reaches a process memory peak of 79937536 bytes, n=1.
That time includes training, evaluation, and per-run writes. It excludes input freeze and the final summary write.
The memory peak includes the interpreter and earlier imports.
The run makes zero API calls and incurs zero API fees in USD. Local compute cost remains unpriced.
It uses Python 3.13.5, NumPy 2.4.2, and Avalon Python 0.2.0 on arm64 macOS.

| Reward | Schedule | Same-family valid | Family valid | Training p50 ms | Evaluation p50 ms |
| --- | --- | --- | --- | --- | --- |
| claim | fixed | 8/160 | 15/160 | 9.516 | 83.568 |
| claim | random | 12/160 | 15/160 | 9.619 | 83.707 |
| claim | disagreement | 3/160 | 15/160 | 9.937 | 83.187 |
| final | fixed | 140/160 | 15/160 | 9.639 | 83.648 |
| final | random | 132/160 | 15/160 | 9.868 | 83.055 |
| final | disagreement | 130/160 | 15/160 | 10.101 | 82.258 |
| history | fixed | 160/160 | 15/160 | 9.710 | 83.366 |
| history | random | 160/160 | 15/160 | 9.812 | 83.424 |
| history | disagreement | 160/160 | 15/160 | 10.275 | 84.463 |

Each timing column contains 20 observations, one per learner seed. No timing confidence interval is estimated.
Evaluation includes frozen table loading. Fixed-schedule timings also include random and known-good controls.
Those evaluation timings are not directly comparable across schedules.
The known-good script produces 160/160 valid outcomes in both partitions. It uses zero training interactions.
The random policy produces 10/160 same-family and 15/160 family outcomes. It also uses zero training interactions.
Those control counts use the history arm, 20 seed clusters, and eight episodes per seed and partition.
Their evaluation p50 times are 0.079 and 0.086 ms for the known-good control, and 0.102 and 0.100 ms for random.
These control timings exclude training and table loading. They have 20 observations per partition and no estimated timing interval.

The history arm is the complete task assertion baseline. It is not a new learning algorithm.
With random scheduling, history versus final changes same-family validity by 17.5 percentage points, with a conditional 95% interval of [7.5, 30.0].
With disagreement scheduling, that difference is 18.75 percentage points, with a conditional interval of [8.75, 30.0].
The disagreement schedule gains zero percentage points over history/fixed and history/random, with conditional intervals [0.0, 0.0].
No reward arm shows a positive disagreement-schedule interval against both schedule baselines.

Every learned condition produces 15/160 valid family outcomes, equal to the random control.
No family transfer advantage appears in this suite.
The intervals use 2000 paired bootstrap resamples of complete learner seeds, with bootstrap seed 104729.
They condition on the fixed synthetic task suite. They do not quantify uncertainty over new task families.
The complete reachable tables do not support a mutation-family holdout claim.
The Python outcome check shares the published specification with the TypeScript verifier.

## Sampling receipts

The seed-7 census has 76 cases across 19 families: 36 known mismatches, 24 clean controls, and 16 insufficient-evidence cases.
Reserved families are authored with this implementation. They are not an independent blind evaluation.
The dense categorical assertion and Avalon return the correct status on all 76 cases.
This establishes parity with the dense assertion. No detection advantage appears in this census.

| Method | Correct statuses | Detected mismatches | False alarms | Unknowns | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| selected-logprob | 40/76 | 12/36 | 0/24 | 4 | 0.003542 | 0.004625 |
| complete-support | 48/76 | 20/36 | 0/24 | 4 | 0.007333 | 0.008167 |
| dense-categorical-assertion | 76/76 | 36/36 | 0/24 | 16 | 0.026624 | 0.054875 |
| avalon | 76/76 | 36/36 | 0/24 | 16 | 0.095459 | 0.120584 |

Each method has 76 heterogeneous timing samples from one run with allocation tracing enabled.
No repeated-run timing interval or production confidence interval is estimated.
The whole census reaches a traced Python allocation peak of 139510 bytes, n=1.
That value is not whole-process memory or a separate per-method peak.
All methods incur zero API fees in USD. Local electricity cost remains unmeasured.
The census uses Python 3.13.5 and Avalon Python 0.2.0 on arm64 macOS.
The receipt checks do not execute a model, trainer, or GPU kernel.

## Trace contracts

The seed-7 comparison contains 28 cases: 12 valid plans, 12 invalid plans, and four missing-evidence views.
Avalon and the simple full assertion return identical verdicts for all 28 cases.
Five timing repetitions produce 140 samples per method. They do not increase the accuracy sample count.

| Method | Correct cases | False accepts | False rejects | Unknowns | p50 ms | p95 ms | RSS after bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| accept-all | 12/28 | 12/12 | 0/12 | 0 | 0.000042 | 0.000167 | 72695808 |
| weak-claim | 8/28 | 12/12 | 4/12 | 0 | 0.000166 | 0.000167 | 72957952 |
| simple-full-assertion | 28/28 | 0/12 | 0/12 | 4 | 0.028584 | 0.081417 | 80855040 |
| avalon-trace-contract | 28/28 | 0/12 | 0/12 | 4 | 0.063792 | 0.142208 | 84295680 |

The false-accept denominator is the 12 known invalid plans. The false-reject denominator is the 12 valid plans.
Exact case counts have no sampling uncertainty within this fixed census. They do not estimate a production rate.
Timing includes clock overhead and excludes fixture construction. No latency interval is estimated.
RSS samples are not peak-memory measurements.
Every method makes zero API calls and incurs zero API fees in USD. Local compute cost remains unmeasured.
The run uses Node.js 22.22.3, Zod 4.6.7, and method version 1 on an Apple M5, arm64 macOS.

## Cross-language diagnosis

The final diagnosis trains a history policy with seed 7 and 2400 interactions. It records 397 changed updates.
The learned episode has proxy return 1.0 and a valid independent outcome.
The TypeScript contract matches all four rules in 50.556042 ms, n=1, including Node startup.
The restored side-effect counterexample also has proxy return 1.0, but its independent outcome is invalid.
The contract reports two mismatches and one rewarded disagreement in 52.012167 ms, n=1, including startup.
No timing interval or memory measurement is available for this two-case check. Local compute cost remains unmeasured.
This verifies the Python export and TypeScript rule composition on two synthetic cases.
It does not estimate generalization or production detection rates.

## Reproducibility

All 180 keyed policy hashes, update hashes, budgets, and outcome metric records match across three complete runs.
The first run precedes the export identity correction and uses Python package 0.1.0.
The corrected SDK run also uses 0.1.0. The final public CLI run uses 0.2.0.
Their plan and holdout hashes agree.

The first aggregate semantic hash differs because the export correction changes snapshot identifiers and snapshot hashes.
The corrected SDK run and final public CLI run share this aggregate hash:
`e7fe50f8c82711645adf0975b71db4d0d84eb731e6882fda0fe19af8b93c8661`.
The evidence preserves the first aggregate hash and a common learning-and-metrics projection hash.
All eight current policy source hashes match the final CLI report.
The sampling benchmark module hash and diagnosis CLI entry hash also match the current files.
The CLI entry hash does not bind every imported module.

The frozen policy plan hash is `8aaec5290c2ed99916a27257c6c95d97aa85f213c1b24ab54f3ffb557150003a`.
The holdout hash is `a8d6b5cdb205bf892c4efca182ecb5b61127580b2e0778a7187e21c2422ba039`.
The sampling fixture hash is `1473ec448493d503b7bd13c1f0da2f67fa91f25b9840467be1f3067428ee5c26`.
The trace fixture hash is `9f53a70792de705902e10177c6320bca94ef685830da54447623bc8580672562`.
Hashes bind supplied artifacts and source bytes. They do not authenticate a recorder or an external outcome.

No independent user benefit, market demand, broad novelty, or production policy improvement is established.
The remote PR, CI, and release ledger records publication separately.
