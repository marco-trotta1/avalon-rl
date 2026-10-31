# Avalon agent commands

Date: 2026-10-31.
Status: accepted design, implemented as agent workflows in Avalon 0.5.0.
Use the [command guide](../agent-commands.md) for current execution and compatibility requirements.

## Product

Install Avalon inside an existing coding agent.
Use the host model for reasoning and the Avalon runtime for executable RL work.
The installer supports Cursor, Claude Code, and Codex skill directories.
Each host uses its supported invocation syntax. Live host UI discovery remains untested.

The user describes a goal in ordinary language.
The command finds the relevant code, data, configuration, and compatible prior results.
It executes a defined process and leaves a result that another engineer can inspect and reproduce.

The references are [pstack](https://github.com/cursor/plugins/tree/main/pstack) and [gstack](https://github.com/garrytan/gstack).
pstack supplies a useful pattern for routing work and comparing independent candidates.
gstack supplies a useful pattern for distinct roles, artifact handoffs, and verification.
The RL command catalog below is an original proposal. No algorithmic novelty is claimed.

## Shared behavior

- Detect the project type, supported trainers, environment interfaces, hardware, datasets, and existing evaluation commands.
- Save a project profile. Refresh it when the relevant source or dependency versions change.
- Infer paths and routine settings from the repository. Ask only for missing intent, access, or an uncovered budget decision.
- Reuse compatible artifacts through a run identifier. Reject stale results from a different task, model, dataset, or source revision.
- Use the configured host model. Additional providers are optional and require the project's existing authorization.
- Apply the saved execution scope and budget. Prepare a runnable job before requesting any missing spending authorization.
- Preserve private data locally. Publish only artifacts allowed by the release policy.
- Separate completed execution from a positive experiment result. A negative result can complete successfully.
- Report unsupported integrations and absent evidence explicitly. Do not substitute a synthetic demonstration for a requested real training run.
- Use separate workers when hypotheses, implementations, or evaluation tasks can proceed independently.

Each process writes a plan, manifest, execution record, result, and artifact references where applicable.
The manifest records source and data identities, library versions, seeds, splits, method settings, and resource limits.
The result separates observations, hypotheses, verified findings, and unresolved questions.
Measured comparisons include the baseline, sample unit, uncertainty, latency, and cost status.
Unknown host-model or compute costs remain unknown.

Training, candidate selection, and final evaluation use separate partitions.
Freeze the candidate before the final evaluation.
Record holdout exposure. A label alone does not establish a blind evaluation.
An agent judge can supply evidence, but its opinion does not establish an independent outcome.

## The 20 commands

The Foundation fields describe the capabilities available before implementation.

### 01. `/avalon`: run the appropriate RL workflow

- Example: `/avalon Improve this agent's completion on unseen tasks within the approved budget`.
- Work: inspect the project, identify the current bottleneck, select the required commands, and coordinate their execution.
- Output: a concrete plan, linked artifacts, verified changes, and a result with unresolved limits.
- Completion: satisfy the stated outcome or produce the evidence that prevents further progress.
- Foundation: new coordinator and project discovery. Reuse the current runtime where its capabilities apply.

### 02. `/rl-research`: find a testable research opportunity

- Example: `/rl-research Find overlooked failure modes in this reward pipeline`.
- Work: follow primary papers, source, issues, fixes, and competing methods. Update the research queue after each lead.
- Output: ranked hypotheses, supporting evidence, disconfirmation, and the cheapest decisive experiment.
- Completion: each retained hypothesis has a falsifier and a named simple baseline.
- Foundation: new research workflow. Reuse the prior research method and the host's permitted browsing tools.

### 03. `/rl-spec`: define the task and experiment

- Example: `/rl-spec Teach this support agent when to resolve a ticket or escalate`.
- Work: define observations, actions, authority, outcomes, rewards, endings, baselines, evaluation splits, and resource limits.
- Output: a task specification, acceptance rules, and a frozen experiment plan.
- Completion: each metric has an observable source. Unresolved domain assumptions remain visible.
- Foundation: new authoring workflow. Reuse the existing task and contract concepts.

### 04. `/rl-env`: build an executable environment

- Example: `/rl-env Build an environment around this support workflow`.
- Work: inspect the existing interface, implement the supported adapter, and exercise resets, actions, observations, and episode endings.
- Output: executable environment code, tests, example rollouts, and valid and invalid control policies.
- Completion: actual executions establish the declared interface and controls.
- Foundation: extend the current operations world. General environment construction and framework adapters are new work.

### 05. `/rl-scenarios`: generate structured task coverage

- Example: `/rl-scenarios Add ambiguous requests, interrupted work, and valid alternative solutions`.
- Work: derive case families, preserve task constraints, vary difficulty, and reserve complete groups before search or training.
- Output: a versioned generator, labeled controls, a coverage map, and a split manifest.
- Completion: cases satisfy their construction rules. Uncertain labels remain uncertain.
- Foundation: extend the existing mutations, paired transformations, and holdout checks.

### 06. `/rl-reward`: build and test the grader

- Example: `/rl-reward Reward settlement only when the ledger confirms the requested outcome`.
- Work: inspect task code and traces, implement outcome rules, and test successful, failed, partial, and missing-evidence cases.
- Output: a reward implementation, declared contracts, tests, and disagreement examples.
- Completion: controls reproduce the expected reward behavior without exposing expected answers to the policy.
- Foundation: current trace contracts and world verifiers provide a base. General reward authoring is new.

### 07. `/rl-break`: find rewarded failures

- Example: `/rl-break Try to earn credit without completing the requested payment`.
- Work: search authorized local environments or supplied traces for false accepts, false rejects, side effects, and scoring shortcuts.
- Output: replayable counterexamples, grader disagreements, and the exact searched scope.
- Completion: each confirmed failure reproduces. Untested action space remains explicit.
- Foundation: extend the current bounded search and counterexample machinery.

### 08. `/rl-harden`: repair a demonstrated grading failure

- Example: `/rl-harden Repair the latest reward exploit and preserve valid alternatives`.
- Work: reproduce the failure, add a failing regression, patch the grader, and evaluate frozen valid and invalid controls.
- Output: a tested patch, a repair comparison, and the retained counterexample.
- Completion: the exploit fails and valid controls remain valid. The final holdout does not select the patch.
- Foundation: new repair workflow over existing checks and witnesses.

### 09. `/rl-data`: inspect the learner's experience

- Example: `/rl-data Check whether collection, storage, and replay preserve this dataset`.
- Work: locate conversion boundaries, create supported exports, and compare observations, rewards, context, endings, masks, and exact split overlap.
- Output: the first changed boundary, a supported exporter, an audit report, and reproducing evidence.
- Completion: validate the actual path. Missing source evidence prevents a preservation claim.
- Foundation: current snapshot, pipeline, overlap, Gymnasium, and Minari engines. Automatic project wiring is new.

### 10. `/rl-probs`: inspect generation and training probabilities

- Example: `/rl-probs Check whether this trainer interprets sampled tokens consistently`.
- Work: inspect the detected sampler and trainer, capture supported evidence, and compare supports, distributions, processors, masks, and correction weights.
- Output: token-level findings, unknown capture fields, and private categorical gradient witnesses where evidence permits.
- Completion: verify a real adapter with a bounded run before claiming trainer interoperability.
- Foundation: current finite probability engine. Live trainer capture and transport adapters are new.

### 11. `/rl-credit`: inspect which decisions receive learning credit

- Example: `/rl-credit Check whether tool results or padding receive credit for the final outcome`.
- Work: trace rewards through groups, advantage calculations, action boundaries, and active loss masks.
- Output: a credit map, reproducible assignment errors, and proposed experiments for ambiguous attribution.
- Completion: separate mechanical assignment checks from causal claims. Replay counterfactual actions only in supported controlled environments.
- Foundation: new advantage and credit inspection. Reuse token roles, masks, and replay primitives.

### 12. `/rl-train`: run a bounded training experiment

- Example: `/rl-train Compare the current reward with the repaired reward using the saved budget`.
- Work: validate the installed trainer adapter, run a smoke test, freeze the configuration, and execute within the approved limits.
- Output: checkpoints or policy tables, actual update receipts, progress, resource use, and a reproducible manifest.
- Completion: show actual learner updates and account for failed or stopped runs.
- Foundation: current finite CPU Q-learning. Broader trainers and their checkpoint integrations are new.

### 13. `/rl-diagnose`: explain a failing or misleading run

- Example: `/rl-diagnose Reward rises while held-out task completion falls`.
- Work: join run settings, source changes, learning metrics, rewards, and traces. Test competing explanations with small controlled checks.
- Output: ranked causes, ruled-out hypotheses, reproductions, and a tested correction when the evidence supports one.
- Completion: a confirmed cause needs an observed failure and a discriminating check.
- Foundation: new investigation workflow using current audit engines and future trainer telemetry.

### 14. `/rl-ablate`: test which component changes the outcome

- Example: `/rl-ablate Is the gain caused by the reward change or the sampling temperature?`.
- Work: freeze a comparison matrix, pair seeds and budgets, execute all planned conditions, and preserve failures.
- Output: effect estimates, uncertainty, outcome and cost comparisons, and a complete experiment ledger.
- Completion: distinguish exploratory selection from the final held-out comparison.
- Foundation: extend current reward-arm comparisons, paired statistics, and run manifests.

### 15. `/rl-curriculum`: test a practice schedule

- Example: `/rl-curriculum Focus practice on the failure families that matter`.
- Work: propose a training-only schedule and compare it with fixed and random schedules under the same interaction budget.
- Output: a scheduler, coverage records, learning curves, and an equal-budget comparison.
- Completion: retain a candidate only when the declared comparison supports it. Preserve ties and losses.
- Foundation: current finite schedules and outcome records. General trainer integration is new.

### 16. `/rl-eval`: evaluate a frozen candidate

- Example: `/rl-eval Compare this checkpoint with the previous checkpoint on the frozen suite`.
- Work: verify candidate and dataset identity, execute the held-out suite, and compare simple baselines and independent outcome checks.
- Output: outcome rates, failure cases, seed-level uncertainty, latency, and cost records.
- Completion: bind every result to the actual candidate and evaluation artifacts. Disclose evaluator dependence and missing evidence.
- Foundation: extend current finite evaluation, baseline, holdout, and reporting engines.

### 17. `/rl-transfer`: test where learned behavior stops working

- Example: `/rl-transfer Test new task families, record names, and operating conditions`.
- Work: freeze the policy, apply declared shifts, run the relevant controls, and separate renaming tests from new-family tests.
- Output: a transfer map, failure boundaries, and comparison with a simple baseline.
- Completion: use no evaluation updates for a zero-shot transfer claim. Report adaptation as a separate condition.
- Foundation: current paired audits and finite family holdouts. General shift generators and model adapters are new.

### 18. `/rl-optimize`: improve a measured resource constraint

- Example: `/rl-optimize Reduce rollout cost while preserving the frozen quality requirement`.
- Work: profile the actual run, identify a limiter, change one justified component, and compare equivalent workloads.
- Output: a tested patch and before/after resource and outcome measurements.
- Completion: record the baseline, sample unit, uncertainty, versions, and quality constraint before claiming an improvement.
- Foundation: new profiling and optimization workflow. General runtime instrumentation is required.

### 19. `/rl-reproduce`: independently rerun a result

- Example: `/rl-reproduce Rebuild and rerun the latest supported experiment`.
- Work: resolve the recorded code, dependencies, data, settings, and seeds, then rerun the declared method.
- Output: a reproduction receipt, result differences, and named environmental or artifact gaps.
- Completion: use declared numerical tolerances. Do not promise identical GPU bytes across hardware.
- Foundation: current manifests, hashes, deterministic fixtures, and replay. General environment restoration is new.

### 20. `/rl-release`: deliver a verified RL artifact

- Example: `/rl-release Package this environment and its evaluation evidence for the configured destination`.
- Work: review code and claims, check allowed artifacts, test installation, and apply the saved publication policy.
- Output: an installable environment or policy bundle, evaluation evidence, a model or task card, and a release receipt.
- Completion: publish the exact tested artifact when authorized. Keep raw private data and local path metadata outside public packages.
- Foundation: current package workflow, manifests, and publication regression. Policy and environment distribution adapters are new.

## A proposed user session

```text
/rl-spec Teach this support agent when to escalate an unresolved billing ticket
/rl-env Build the environment around the approved task specification
/rl-reward Implement the declared success and authority rules
/rl-break Find a way to earn reward while violating those rules
/rl-harden Repair the confirmed exploit
/rl-train Compare the original and repaired rewards within the saved budget
/rl-eval Evaluate the frozen candidates on the reserved task families
```

The user can instead give the complete goal to `/avalon`.
The coordinator links these processes and retains the same evidence obligations.

## Initial implementation recommendation

Build the shared project profile and artifact handoffs first.
Start the visible command set with `/avalon`, `/rl-data`, `/rl-reward`, `/rl-break`, `/rl-diagnose`, `/rl-train`, `/rl-eval`, and `/rl-reproduce`.
Validate a real trainer adapter before advertising language-model training support.
The probability command becomes a stronger product when actual sampler capture runs and its transport is checked.
The remaining commands extend that verified base.

Current Avalon has a finite operations world, executed data adapters, probability receipts, trace checks, and finite Q-learning experiments.
The workflows and project installer ship in 0.5.0. Broad trainer integrations remain outside the built-in adapter.
The [release evidence](../releases/2026-10-31/agent-commands.md) records execution, negative results, and validation limits.
