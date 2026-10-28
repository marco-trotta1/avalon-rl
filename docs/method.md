# Method and evidence

Review date: 2026-10-27.
Model version: `comparable-median-v1`.

## Price model

Let `N` be the eligible subject volume.
Let each matched transaction have amount `P_i` and eligible volume `N_i`.

```text
unit_price_i = P_i / N_i
estimate = N * median(unit_price_i)
observed_low = N * min(unit_price_i)
observed_high = N * max(unit_price_i)
```

The named simple baseline is the unweighted median of matching unit prices.
There is no learned model or secondary quality adjustment.
Each accepted counterparty group has equal weight.
The selector accepts the newest eligible source per group and document.

The model requires 3 matching completed transactions, documented provenance, and documented transfer rights.
It matches asset type, domain, modality, intended use, and the complete rights object.
It filters transactions to the previous 365 days and volumes within 0.25 to 4 times the subject volume.
These thresholds are explicit product policies. Research does not validate them.

The observed range describes deal dispersion.
It does not include uncertainty from hidden deal terms, missing sales, incorrect declarations, or future buyer demand.
It is not a prediction interval or confidence interval.
Linear pricing can misstate the value of large bundles or rare capabilities.

## Diagnostic validation

The app leaves each accepted deal out once.
It predicts that deal's unit price using the median of the remaining deals.
It reports the median absolute percentage error across these held-out deals.
The sample size appears beside the error.

This diagnostic uses the same imported ledger and selection policy.
It does not form an independent test of a new asset.
It does not establish production accuracy.
No real transaction dataset is included in the repository.
No accuracy claim against real sale prices is supported yet.

The calculation uses local CPU work. It calls no paid model service.
The app does not meter electricity, device cost, or elapsed analysis time.
These quantities remain unmeasured.

## Research sources

### Minari dataset standards

[Farama Foundation: Dataset Standards](https://minari.farama.org/content/dataset_standards/)

Minari documents episode observations, actions, rewards, terminations, and truncations.
It also documents source metadata and optional reset seeds.
TraceAtlas uses a JSON export with analogous arrays.
It does not claim native Minari compatibility.
The structural checks do not establish policy performance or a dollar value.

### Gymnasium episode endings

[Farama Foundation: Handling Time Limits](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/)

Gymnasium distinguishes termination from truncation because they affect learning targets differently.
TraceAtlas preserves both flags and accepts either as an episode ending.
Neither flag proves task success.
The app does not reject useful failure episodes because they have low rewards.

### Offline RL dataset composition

[Fu et al.: D4RL](https://arxiv.org/abs/2004.07219)

D4RL evaluates offline RL with varied collection policies and task compositions.
It supports examining dataset composition instead of treating volume as training utility.
TraceAtlas does not convert these research results into price premiums.
Task identifiers remain declarations, not verified task diversity.

### Task-dependent data value

[Ghorbani and Zou: Data Shapley](https://proceedings.mlr.press/v97/ghorbani19c.html)

Data Shapley measures contribution to a specified learning algorithm and performance metric.
It does not supply universal market prices.
TraceAtlas does not compute these values or claim a training contribution from static file checks.

## Evidence needed next

Collect consented, documented closed transactions with normalized asset scope and equivalent rights.
Keep source documents private.
Record actual held-out sale outcomes before evaluating a new pricing method.
Split future evaluations by counterparty group and transaction time.
Do not split affiliated transactions across training and test sets.

Compare each future method against the median baseline.
Report error, interval coverage, sample size, elapsed time, and measured compute cost together.
Retain negative results and the exact input fingerprints.
Synthetic fixture checks cannot replace this market validation.
