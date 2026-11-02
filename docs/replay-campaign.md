# Assess a repair with Avalon Replay

A campaign checks the grader before it assesses a repair.
Keep the report private. It contains task labels and execution evidence.

The campaign runs the observed failure, the reference repair, and each declared control.
The observed failure must fail. The reference and each positive control must pass.
Each negative control must fail through a behavioral mismatch or a protected change.
An infrastructure error, timeout, or invalid output cannot satisfy a negative control.

Each candidate runs against the same frozen task.
The campaign accepts at most 10 candidates and a timeout from 1 through 60 seconds per test.
The report retains all runs, including failed and inconclusive runs.
Unconfirmed container cleanup stops all later execution in the campaign.
Skipped snapshots retain all test rows with an inconclusive result.
The report lists outstanding container names for operator review.
Confirm container removal before starting another campaign.
Development and holdout counts appear separately.
An accepted repair passes the supplied tests after the grader passes its controls.
The acceptance applies only to the supplied task and tests.
Use `run_campaign(task, candidates, image, timeout_seconds=5)` in the Python API.
The candidates map labels to file snapshots. Each label contains at most 120 characters.
Use `render_campaign_html(report)` to create the standalone HTML.

## Interpret the result

- `accepted`: The supplied evidence satisfies the campaign requirements.
- `rejected`: A completed check contradicts a campaign requirement.
- `inconclusive`: An execution problem prevents a complete decision.

The report includes task and snapshot hashes, image identity, and measured run times.
Each launched snapshot executes once. The report does not estimate timing uncertainty.
The campaign makes no model calls. The model API cost is zero USD.
Local compute and engineering costs remain unpriced.
Candidate generation costs are outside the campaign measurement.

The HTML report includes the same evidence without external scripts, stylesheets, or images.
All user text is escaped before rendering.
The report does not execute captured HTML or JavaScript.

## Limits

One task cannot establish generalization to new task families.
Holdout labels do not prove that the repair author lacked access to the tests.
The campaign does not train a model or establish a model improvement.
The behavioral grader supports reviewed Python tasks. It is not an adversarial verification boundary.
The candidate shares an interpreter with the execution harness and can interfere with its evidence.
Container isolation protects the host within the runner's limits. It does not authenticate candidate behavior.
Use independently reviewed tasks and controls. Retain negative results.
