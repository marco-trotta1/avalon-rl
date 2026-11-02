# Avalon first-team offer

Avalon turns a recorded agent failure into an executable regression task.

## Who the trial serves

A team has an agent that changes structured business records.
The team observes a failed task or a false completion claim.
An engineering owner can provide authorized records and a disposable test environment.

## What the team receives

- A task with a reset fixture and a bounded action interface.
- A recorded failed execution and a successful reference execution when available.
- Success rules reviewed by the team.
- A comparison with the team's ordinary assertion.
- A failure package that reruns from a fresh reset.
- A regression command that fails when the task outcome fails.
- A private report with costs, timings, unknowns, and limitations.

The team keeps its data and can run the CLI locally.
No hosted account is required for the reference workflow.
The adapter runs with the team's chosen local permissions.
Use the team's sandbox infrastructure when stronger isolation is required.

## What the trial asks from the team

- One engineering owner and one independently reviewed failure.
- Permission to use the selected records locally.
- A disposable environment and an observable success condition.
- An agreed engineering budget and execution budget.
- One attempt to reuse the delivered test after an agent change.

## What counts as useful

The owner reproduces the failure without Avalon staff operating the workflow.
The owner uses the same test after an agent change.
The owner identifies a reason to keep the test instead of maintaining only the ordinary assertion.
Record setup effort and repeat-use effort for both approaches.
A result that does not justify continued use remains a valid trial outcome.

## Current evidence

The reference uses a SQLite refund workflow with fictional records.
It demonstrates execution, independent observation, failure capture, reset replay, and task export.
The simple history assertion remains a required comparison.
The reference does not establish customer demand, general detection accuracy, or training improvement.

## First conversation

Ask the team to describe a failure before showing the demo.
Ask how it reproduces the failure today and what that process costs in engineering time.
Show the reference workflow and agree on one concrete deliverable.
Complete [the private worksheet](team-trial-worksheet.md) before processing records.
Use [the trial guide](team-trial.md) to execute the engagement.
