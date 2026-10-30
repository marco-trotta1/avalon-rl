# Synthetic world benchmark

Build the project before running the benchmark.

```sh
npm run build
node --input-type=module -e 'import {runWorldBenchmark} from "./dist/world/index.js"; console.log(JSON.stringify(runWorldBenchmark({seed:7,repetitions:25}),null,2))'
```

The benchmark compares `accept-all`, `weak-claim`, and `task-oracle` on the same 20 synthetic fixtures.
The `accept-all` checker is the deliberately simple baseline.
The hand-authored mutation labels establish the intended outcomes independently of the oracle.
The report also includes the full verifier challenge.
It retains every case and every missed case.

Accuracy uses 20 unique cases per method.
Repetitions increase only the latency sample size.
The report records the seed, fixture hash, Node version, Zod version, and method version.
Each method reports API calls, API cost, accuracy, false accepts, false rejects, and latency together.
The runner has no API client.
The API call count is 0 and the API cost is 0 USD.
The report sets `localComputeCostUsd` to `null` and `localComputeCostStatus` to `unmeasured`.
Local compute and electricity costs are not measured.

The latency measurement excludes fixture construction.
It includes the check call and clock overhead.
The report gives observed minimum, median, 95th percentile, and maximum latency in milliseconds.
These quantiles describe local samples and do not provide confidence intervals.
Accuracy counts are exact for the finite fixture set.
They do not estimate real-world accuracy.
The benchmark does not run a model or train a policy.

## Recorded local measurement

This measurement uses seed 7, Node 22.22.3, Zod 4.6.7, and method version 1.
The fixture hash is `b8d9dfb78a007b3013b6134a9866d53b092b7fdebfc5490f0133ba6c0e2352fc`.
Each method has 20 unique accuracy cases and 500 latency samples from 25 repetitions.

| Method | Correct cases | False accepts | False rejects | Median, ms | 95th percentile, ms | API cost, USD | Local compute cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| accept-all baseline | 8/20 | 12 | 0 | 0.000083 | 0.000084 | 0 | Unmeasured |
| weak-claim | 4/20 | 12 | 4 | 0.000125 | 0.000125 | 0 | Unmeasured |
| task-oracle | 20/20 | 0 | 0 | 0.014500 | 0.021083 | 0 | Unmeasured |

Accuracy has no sampling uncertainty within these 20 cases.
It provides no population confidence interval.
Latency varies across local runs and includes clock overhead.
The shortest measurements approach the timer resolution.
Use the runner output for the observed minimum and maximum.
