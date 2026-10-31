---
name: rl-probs
description: "Check sampler and learner probability agreement, support, processors, masks, roles, and correction weights. Use for suspicious likelihoods or sampling interoperability."
---

# /rl-probs

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Establish which generation and learner probability claims the captured evidence supports.

## Discover

1. Inspect the actual sampler, learner, versions, processor order, roles, group IDs, and loss masks.
2. Locate source and learner sampling receipts or the existing capture hook.
3. Name unavailable fields and unsupported processors before interpreting an audit.

## Execute

1. Capture real rollout evidence through a supported adapter.
2. For a supported CartPole checkpoint, run `avalon-python gym-probs --checkpoint CHECKPOINT --output NEW_DIRECTORY`.
3. Read the produced source.json, target.json, and report.json.
4. For existing receipts, run `avalon-python sampling-audit --source SOURCE --target TARGET --output REPORT`.
5. Inspect selected-token identities, full support, processed distributions, masks, and correction weights.
6. Run `avalon-python sampling-witness --source SOURCE --target TARGET --sample SAMPLE --position POSITION --output WITNESS` for a categorical witness.
7. Validate a new capture hook with a bounded real run and an independently computed learner replay.
8. Keep raw token and categorical evidence private.

## Verify

1. Check that capture and replay refer to the same decisions and transformations.
2. Test a clean control and a deliberately changed probability or mask.
3. Inspect unknown outcomes instead of treating missing support as agreement.
4. Limit gradient claims to the finite categorical calculation represented by the witness.

## Deliver

- Capture source or hook with its executed check.
- sampling report and private witness.
- result.md: supported findings, unknown fields, and exact adapter scope.

## Capability boundary

The built-in live capture covers the CartPole categorical policy. TRL, vLLM, PPO, and language-model integration require a separately verified adapter.
