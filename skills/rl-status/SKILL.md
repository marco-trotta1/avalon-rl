---
name: rl-status
description: "Inspect saved Avalon runs, evidence, terminal states, and input drift to identify the next valid action without rerunning training or changing records."
---

# /rl-status

Read [the workflow protocol](../_shared/workflow.md) as a reference.
Before performing its context or setup steps, read [the runtime procedure](../_shared/selection.md).
Read [the artifact contract](../_shared/artifacts.md) when a separate inspection report is requested.

## Outcome

Explain the saved workflow state, verified evidence availability, and next valid action for the selected project.

Example: `/rl-status Show the latest experiment runs and identify which candidate can proceed to final evaluation`.

## Discover

1. Resolve the selected project and compatible runtime before inspecting its private records.
2. Read any requested run identifier, workflow filter, or saved result reference.
3. Set a bounded list limit. Do not scan private experiment artifacts without a task reason.

## Execute

1. Run `avalon agent runs --limit LIMIT --project PROJECT` to inspect recent saved runs.
2. Read the returned run identifiers, workflow names, status fields, and inspection errors.
3. For a relevant run, use `avalon agent resume RUN_ID --project PROJECT` to inspect its bindings and evidence records.
4. Treat a drift or artifact error as an inspection finding. Preserve the existing records.
5. Read the substantive result and linked reports before describing the scientific conclusion.
6. Identify the next action from the frozen experiment plan, actual outputs, and remaining resource budget.
7. Distinguish a planned workflow, executed training, completed process, and supported research conclusion.
8. Return the inspection result without starting a run, recording events, acknowledging drift, or executing training.
9. Continue work only when the user's request also authorizes that action. Use the appropriate workflow for execution.

## Verify

1. Confirm that every reported run identifier comes from the selected project.
2. Report damaged records and unavailable artifacts. Do not turn them into completed results.
3. State the listing limit and any incomplete inspection.
4. Keep terminal runs unchanged. A follow-up experiment requires a new run.

## Deliver

- A bounded run list with workflow, recorded status, evidence availability, and relevant paths.
- A concise explanation of the next valid action and any unresolved drift or missing evidence.
- An inspection report only when the user requests a saved report.

## Capability boundary

Inspection reads saved local records. It does not discover remote training jobs or prove an artifact's scientific claims.
