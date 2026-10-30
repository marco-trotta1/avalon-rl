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
These values exclude local compute and electricity costs.

The latency measurement excludes fixture construction.
It includes the check call and clock overhead.
The report gives observed minimum, median, 95th percentile, and maximum latency in milliseconds.
These quantiles describe local samples and do not provide confidence intervals.
Accuracy counts are exact for the finite fixture set.
They do not estimate real-world accuracy.
The benchmark does not run a model or train a policy.

## Recorded local measurement

This measurement uses seed 7, Node 22.22.3, Zod 4.6.7, and method version 1.
The fixture hash is `e43554bbe96e3e46f6fe4a9a166bda1fae533fc8ae5ad964c69973324600fb87`.
Each method has 20 unique accuracy cases and 500 latency samples from 25 repetitions.

| Method | Correct cases | False accepts | False rejects | Median, ms | 95th percentile, ms | API cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| accept-all baseline | 8/20 | 12 | 0 | 0.000083 | 0.000084 | 0 |
| weak-claim | 4/20 | 12 | 4 | 0.000125 | 0.000125 | 0 |
| task-oracle | 20/20 | 0 | 0 | 0.013542 | 0.019750 | 0 |

Accuracy has no sampling uncertainty within these 20 cases.
It provides no population confidence interval.
Latency varies across local runs and includes clock overhead.
The shortest measurements approach the timer resolution.
Use the runner output for the observed minimum and maximum.
