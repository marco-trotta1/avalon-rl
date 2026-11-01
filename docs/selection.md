# Candidate selection

Use `select` to compare a frozen candidate roster with bounded evaluation scores.
The coding harness constructs candidates and executes the evaluations.
The local selector checks the supplied records and computes the decision.
It does not invoke agents, train policies, or authenticate the records.

```sh
node dist/cli.js select --plan selection-plan.json --scores selection-scores.json --out selection-report.json
```

Exit code `0` means the bounds select one candidate.
Exit code `5` means the evidence remains inconclusive.
Exit codes `1` and `2` mean invalid data or invalid usage.
The command preserves existing output files and creates new files with owner-only permissions.
Each input must use UTF-8 without a byte order mark and remain within 10 MiB.

## Freeze the experiment

Declare the baseline, candidate identities, metric, bounds, sampling rule, trial identifiers, and sample count before evaluation.
Freeze every candidate before collecting the selection scores.
Use known population bounds. Do not estimate these bounds from the observed scores.
Use one independent evaluation unit per sample, or sample uniformly without replacement from a declared finite population.
For site data, separate sites and years before sampling the evaluation units.
Repeated steps, tokens, and votes from shared-context agents do not supply independent evaluation units.
Candidates can share the same evaluation units. The confidence calculation permits dependence between candidates.

The plan below shows the exact field names.
`artifactSha256` identifies the frozen candidate artifact.
Use the digest of a reviewed control definition for a baseline without a checkpoint.

```json
{
  "format": "avalon-selection-plan-v1",
  "baselineId": "random",
  "metric": { "name": "completion", "lower": 0, "upper": 1, "direction": "maximize" },
  "delta": 0.05,
  "minImprovement": 0,
  "sampling": {
    "unit": "held-out-task",
    "assumption": "independent",
    "seed": 7,
    "sampleIds": ["task-1", "task-2"]
  },
  "candidates": [
    { "id": "random", "artifactSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { "id": "trained", "artifactSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
  ]
}
```

Use `minimize` for a metric where lower values are better.
Use `uniform-without-replacement` for uniform sampling from a fixed finite population.
The plan permits 2 through 32 candidates and 2 through 100,000 evaluation units.
The named baseline must appear in the roster.
Scores and bounds must remain between `-1e12` and `1e12`.

## Record the scores

Compute `planSha256` from the exact plan file bytes, including its whitespace.
Record every candidate and every declared evaluation unit.
The selector rejects duplicate units, missing units, changed candidate identities, and scores outside the known bounds.
The selector does not clip invalid scores.

```json
{
  "format": "avalon-selection-scores-v1",
  "planSha256": "THE_SHA256_OF_THE_EXACT_PLAN_FILE",
  "candidates": [
    {
      "id": "random",
      "artifactSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "status": "complete",
      "samples": [
        { "sampleId": "task-1", "value": 0 },
        { "sampleId": "task-2", "value": 1 }
      ],
      "latencyMs": 12,
      "cost": { "externalApiUsd": 0, "computeUsd": null, "hostAgentUsd": null }
    }
  ]
}
```

The abbreviated scores example omits the second candidate. A complete input must include it.
Use `null` for unpriced compute and host-agent costs. A zero records a known zero cost.
Record a failed candidate with `status: "failed"`, its identity, measurements, and a nonempty `reason`.
Omit `samples` from a failed candidate. Preserve partial evidence in its separate run artifacts.
A failed candidate makes the overall decision inconclusive.

## Read the decision

For `K` frozen candidates, `n` samples, and score bounds `[a,b]`, the radius is:

```text
r = (b-a) * sqrt(log(2*K/delta) / (2*n))
```

The interval is `[mean-r, mean+r]`, intersected with the known score bounds.
The two-sided Hoeffding bound assigns `delta/K` to each candidate.
A union bound covers every candidate simultaneously. Independence between candidates is unnecessary.
The calculation follows [Hoeffding's original paper](https://www.cs.rpi.edu/academics/courses/spring06/random/hoefding.pdf).

For maximization, the selected candidate's lower bound must exceed every alternative's upper bound.
For minimization, its upper bound must fall below every alternative's lower bound.
A candidate that replaces the baseline must also exceed the declared `minImprovement` in the required direction.
The baseline can remain selected when its bounds separate it from every alternative.
Otherwise, the report returns `inconclusive` without a selected identifier.

The calculation normalizes the scores to `[0,1]` before summation and comparison.
This preserves ties when a large metric offset exceeds its score range.
The report includes the normalized means, intervals, and radius. Metric values can round at the machine precision limit.
The report also gives the empirical leaders as a named simple comparison.
Near-equal normalized means use a tolerance of eight machine epsilons.
This tolerance only groups empirical leaders. It does not relax the confidence separation test.
The report retains each sample count, interval, latency, and recorded cost.

The confidence statement conditions on the declared sampling assumptions and population bounds.
The selector labels these assumptions as declared and unverified.
Hashes establish byte identity. They do not establish execution, blind evaluation, or independence.
Reserve a separate final evaluation for the selected candidate.

This procedure permits one inspection after the fixed evaluation budget completes.
Repeated inspection, adaptive stopping, and candidates chosen after viewing these scores need a different error allocation.
Start a new experiment with fresh evaluation data when the candidate roster changes.

## Run the synthetic example

```sh
node dist/cli.js select --plan examples/selection/plan.json --scores examples/selection/scores.json
```

The example contains invented scores for 2 candidates and 8 evaluation units.
The empirical means are 0 and 1. The radius is approximately 0.5233 at `delta=0.05`.
The intervals overlap, so the expected exit code is `5`.
These authored scores establish no policy performance or production accuracy.

Use [the Gymnasium sweep](gym-sweep.md) to collect real local policy scores.
Use [the agent commands](agent-commands.md) for harness coordination and saved run inspection.
