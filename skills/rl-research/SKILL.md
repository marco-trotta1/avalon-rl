---
name: rl-research
description: "Find and test RL research opportunities using primary papers, source, issues, and disconfirmation. Use before proposing an algorithm or explaining a novel failure."
---

# /rl-research

Read [the workflow protocol](../_shared/workflow.md) before work.
Read [the artifact contract](../_shared/artifacts.md) before writing results.

## Outcome

Produce research hypotheses that have sources, competing explanations, and executable falsifiers.

## Discover

1. Read the project task, trainer, evaluation method, prior research, and failed experiments.
2. Identify the exact uncertainty and the permitted research and experiment budget.
3. Search primary papers, official framework source, release notes, issues, and maintained competing implementations.

## Execute

1. Follow promising citations and inspect the actual method or code behind each claim.
2. Check whether an upstream fix, simple assertion, or standard method already resolves the issue.
3. Maintain a research queue. Record the lead, evidence, contradiction, next test, and stopping reason.
4. For each retained hypothesis, specify the mechanism, predicted observation, simple baseline, and cheapest falsifying experiment.
5. Run the cheapest authorized local test when the required data and dependencies exist.
6. Preserve abandoned leads and negative results. Mark inaccessible source content as unread.
7. Separate literature support from empirical evidence collected in this project.

## Verify

1. Check each citation against the actual supporting source.
2. Require a discriminating observation for each retained hypothesis.
3. Do not claim novelty from a search with no matches. State the searched scope and unresolved prior art.

## Deliver

- research.md: primary sources, mechanisms, alternatives, and disconfirmation.
- hypotheses.json: ranked candidates, falsifiers, required inputs, and budget estimates.
- result.md: tested observations and the next decisive experiment.

## Capability boundary

Use the host's permitted native research tools. If browsing is unavailable, analyze local evidence and leave external claims unresolved.
