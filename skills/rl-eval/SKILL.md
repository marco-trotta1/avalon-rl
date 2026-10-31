---
name: rl-eval
description: "Evaluate frozen RL candidates on reserved data with simple baselines, independent outcome checks, uncertainty, latency, and costs."
---

# /rl-eval

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Measure the frozen candidate's declared behavior on the actual reserved suite.

## Discover

1. Read the evaluation contract, candidate hashes, reserved groups, baseline definitions, and exposure history.
2. Verify that training and candidate selection are finished for this comparison.
3. Identify the independent outcome check and any agent-judge dependence.

## Execute

1. Freeze candidate, environment, reward, data, seeds, metrics, stopping rule, and evaluation budget.
2. For a supported checkpoint, run `avalon-python gym-eval --checkpoint CHECKPOINT --seeds SEEDS --output REPORT`.
3. Use evaluation seeds outside the checkpoint's training seed set.
4. Read learned-policy, random-policy, and named control results from the actual report.
5. For project-specific candidates, execute the verified evaluator and independent outcome rules.
6. Record denominators, failure traces, per-group outcomes, resource use, and failed evaluations.
7. Compute uncertainty over independent seeds or groups and disclose small samples.
8. Leave candidate weights and training configuration unchanged during evaluation.

## Verify

1. Check exact artifact identities, seed separation, evaluator version, and exposure.
2. Retain failed evaluations in the denominator according to the frozen policy.
3. Do not equate episode reward with independent task success.
4. Report dependence when the candidate's own model also judges its result.

## Deliver

- evaluation.json: per-case and per-group outcomes.
- evaluation.md: baselines, denominators, uncertainty, latency, costs, and limits.
- failure traces: private reproductions of observed errors.

## Capability boundary

The built-in evaluator covers frozen CartPole checkpoints and finite policy experiments. Other tasks need a verified evaluator and outcome source.
