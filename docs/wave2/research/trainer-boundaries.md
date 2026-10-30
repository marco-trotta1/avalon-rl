# Avalon alpha: trainer boundaries

Date: 2026-10-30. Research owner: alpha_trainers.

## Decision

Build a local audit of sampled-token support and training-token support.
Use inert receipts and a small CPU reference calculation first.
Link every finding to a token position, support set, probability, and update mask.
Treat a missing support as unknown.
Do not infer a support from a top-logprobs list.

The strongest test is a disagreement that selected-token probability logs cannot reveal.
Both supports can assign the sampled token the same probability while they direct updates toward different alternatives.
This is a useful diagnostic hypothesis. It does not establish research novelty, adoption, or policy improvement.

Do not build another generic configuration warning.
TRL already adds candidate replay, configuration guards, and probability diagnostics.
The applicable upstream source has changed since the existing Avalon research pass.

## Iteration 1: verify whether the old lead survives

Seed: the existing research queue names TRL 7936 and 7866 as open questions.

[TRL 7937](https://github.com/huggingface/trl/pull/7937) merges on 2026-10-28.
The merge commit is `c8a5b644a8662ad47feca61e864c49ac6de7f09b`.
The patch rejects `min_p > 0` without a positive `top_k` in AsyncGRPO.
It updates the documentation and adds a configuration test.
The connector supplies the current merge state and the complete patch.
The native web reader cannot fetch this PR.

[TRL 7866](https://github.com/huggingface/trl/pull/7866) merges on 2026-10-29.
The merge commit is `9f86f15c8a033c23f8821ef10400cbc60f78f0e6`.
It carries the sampling support into colocated GRPO with vLLM 0.28 or later.
The reported implementation retains warnings for server mode and older vLLM.
It also adds a test against the existing probability metric.

Decision: retire the hypothesis that Avalon should discover these configurations with a new warning.
The upstream fixes are a named alternative and the first operational recommendation.
Do not infer tagged release coverage from a merge.
The [v1.16.0 page](https://github.com/huggingface/trl/releases/tag/v1.16.0) precedes both merges.
This pass does not establish a later tagged release.

Next seed: inspect which changes the candidate support cannot explain.

## Iteration 2: logits can differ inside the same support

[TRL 7914](https://github.com/huggingface/trl/issues/7914) reports a repetition penalty mismatch.
Its pinned TRL commit is `643ab11435db2080ccd694cbc4fb0b490a38d8ef`.
Its environment uses vLLM 0.32.0, Qwen2.5-0.5B-Instruct, an H100, and seed 0.
The author reports four steps for each setting.
The source distinguishes a changed support from changed logits within that support.
The existing probability metrics expose the failed correction.
No independent training replication occurs in this pass.

[TRL 7915](https://github.com/huggingface/trl/pull/7915) remains open in connector readback.
Its inspected head is `f63e88559670832fcb6334bc5f293a766d7acf22`.
It adds a configuration guard instead of replaying the penalty.
An existing review identifies effective generation overrides as a separate boundary.
The reviewed patch still checks the dedicated repetition field.
Do not report that review as a new Avalon finding.

The [vLLM penalty source at v0.32.0](https://github.com/vllm-project/vllm/blob/v0.32.0/vllm/model_executor/layers/utils.py) separates prompt and output counts.
It applies repetition penalties, then subtracts frequency and presence penalties from the logits.
This pass does not verify the complete sampler processor order.

Decision: a diagnostic must record effective settings and transformation order.
A configuration field alone cannot establish the distribution the sampler uses.
Replay only documented processors. Return unknown for an unsupported processor.

Next seed: test whether matching selected-token probabilities prove a matching training update.

## Iteration 3: a probability match can hide a support mismatch

This case is an analytic construction from the probability contract.
It is not a reproduced defect in TRL or vLLM.

Use the raw logits `[0, 0, 0]` and sampled token `0`.
The sampler support is `{0, 1}`.
The trainer support is `{0, 2}`.
Each support gives token `0` a probability of `0.5`.
Both selected log probabilities are `-0.6931471805599453`.
The probability ratio is `1`.

For the sampled-token log probability, the gradient equals the selected one-hot vector minus the distribution.
The sampler gradient is `[0.5, -0.5, 0]`.
The trainer gradient is `[0.5, 0, -0.5]`.
The gradient L1 difference is `1.0`.

Executed verification: Python 3.13.5, arm64, standard-library `math` only.
The sample contains one deterministic token. No random seed applies.
The selected-probability assertion detects zero of one mismatches.
The complete-support assertion detects one of one mismatches.
The comparison uses an absolute tolerance of `1e-12` for float64 rounding.
No uncertainty estimate or population rate applies to this fixed arithmetic example.
No model forward, optimizer, GPU, network model call, or policy evaluation runs.
No API charge occurs in this arithmetic check. Local electricity cost is not measured.
Latency is not measured.

Decision: retain this as the first controlled regression.
The full-support assertion is the deliberately simple baseline.
Avalon must not claim a detection advantage against that baseline.
The candidate value is provenance, localization, a portable counterexample, and an unknown result when evidence is absent.
Those workflow benefits remain unmeasured.

Next seed: check prior art and identify evidence the receipt must preserve.

## Iteration 4: replay and semantics already have substantial prior art

[DeepSeek-V3.2, section 3.1](https://arxiv.org/html/2512.02556v1#S3.SS1) describes preserving the sampling mask during training.
The proposed Avalon feature does not invent sampling replay.

[Prime-RL 3235](https://github.com/PrimeIntellect-ai/prime-rl/pull/3235) describes capture, transport, packing, and trainer replay.
It also describes constraints for singleton supports, external samples, capture limits, and unsupported combinations.
The PR closes as stale on 2026-10-03. It does not establish a shipped Prime-RL feature.
The source is still relevant prior art.

The [vLLM semantics RFC](https://github.com/vllm-project/vllm/issues/42259) tracks probability semantics and output alignment across several boundaries.
It names raw and processed probabilities, token duplication, streaming, batch effects, and downstream RL differences.
Some linked status descriptions predate the recent TRL merges.
Do not treat this issue as a current status authority for each linked project.
Its speculative replay discussion emphasizes the exact target row for each committed token.

The [pinned TRL trainer](https://github.com/huggingface/trl/blob/9f86f15c8a033c23f8821ef10400cbc60f78f0e6/trl/trainer/grpo_trainer.py) uses completion and tool masks for the correction.
The inspected block converts unavailable sampling log probabilities to zero difference.
That fallback yields an importance ratio of one. It does not prove equality.
The [pinned configuration](https://github.com/huggingface/trl/blob/9f86f15c8a033c23f8821ef10400cbc60f78f0e6/trl/trainer/grpo_config.py) defines token and sequence masking or truncation.

Decision: distinguish unavailable evidence from a verified probability match.
Record token identity, context identity, producer revision, support scope, and the loss mask.
Preserve each token through packing and tool boundaries.
Do not claim a live trainer integration from a custom receipt import.

## Minimum decisive experiment

Freeze the receipt format before generating evaluation cases.
Use small finite categorical distributions with independently calculated probabilities.
Reserve complete families before implementation.
Use families for support permutation, processor omission, temperature mismatch, position shift, and missing evidence.
Include clean controls with ragged support padding, tool tokens, and valid processor differences.

Compare three methods on the same permitted evidence:

1. A selected-logprob equality assertion with a declared tolerance.
2. A simple complete-support and mask assertion.
3. The Avalon audit and its evidence witness.

Require Avalon to match the complete assertion on fully observed cases.
Require unknown when the missing support prevents the requested conclusion.
Measure token localization and reproduction effort separately from detection counts.
Keep the analytic support case separate from real adapter evidence.

Record the seed, fixture hash, hardware, versions, case count, runtime, memory, and local cost limits.
Report counts by family and clean-control false alarms.
Use intervals only for a defined sampling population.
A deterministic fixture census does not establish a production error rate.

Stop or narrow the feature if the same workflow requires only a short assertion.
Stop a real adapter claim if an actual trainer cannot export the required support.
Prefer an upstream fix when a configuration guard resolves the user's immediate problem.

## Focused implementation slices

These are candidate slices, not a requirement to fill a PR count.
Each slice needs its tests, documentation, and public synthetic example.

| Slice | Observable result |
| --- | --- |
| Probability receipt | Parse token identity, producer revision, probability scope, and known or unknown support. |
| Support audit | Detect a different support even when the selected probabilities agree. |
| Stable reference | Recompute selected probabilities from finite logits and explicit support. |
| Processor evidence | Compare recorded effective temperature and supported processor steps. |
| Token alignment | Locate dropped, duplicated, or shifted token evidence across declared stages. |
| Training masks | Check sampled, tool, context, and padding roles against the declared loss mask. |
| Correction impact | Compute token and sequence log ratios without arithmetic overflow. Preserve unavailable evidence. |
| Gradient witness | Reproduce the finite-distribution update difference for one selected token. |
| CLI and reports | Import inert receipts and emit private JSON, Markdown, and a minimal counterexample. |
| Frozen evaluation | Execute family-held-out controls and publish baseline parity and negative results. |

An actual framework exporter is a later slice unless the trainer path runs and its captured evidence is verified.
Do not claim that this list constitutes 10 independent product discoveries.

## Current research queue

1. Select the support audit only if the coordinator accepts its evidence scope.
2. Obtain an actual exported support artifact from a trusted adapter before claiming interoperability.
3. Test unavailable sampler probabilities without converting them into verified matches.
4. Compare diagnosis effort against the complete-support assertion on held-out cases.
5. Seek authorized independent usage after the diagnostic works locally.

## Preserved negative results

The old min-p gap is fixed upstream.
Colocated GRPO sampling replay is fixed upstream.
Configuration warnings and sampling replay are established prior art.
The repetition penalty problem has an existing report and proposed guard.
The exact full-support assertion detects the same constructed mismatch.
No customer demand, broad novelty, real policy gain, or production detection rate is established.
The pass does not modify the product, contact people, install packages, or run third-party code.
