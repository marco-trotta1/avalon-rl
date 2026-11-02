# Start the local trial

This workspace contains a fictional refund workflow and a deterministic reference agent.
It does not call a model or transfer money.
Install Python 3.11 or later and the Avalon CLI before running it.

Warning: Run and replay execute the adapter and agent with your user permissions.
Read the Python files before replacing them with code from another source.
The workspace isolates reference data. It is not an operating system sandbox.

Run these commands from this workspace:

```sh
avalon trial run --data session.json --out run-1
avalon trial replay --bundle run-1 --out replay-1
```

The first command returns code 5 because the missing-observation control remains unknown.
The replay returns code 0 when every recorded execution matches.
Open `run-1/review.md` for the review checklist and comparison counts.
Inspect `run-1/collection.json` for independent database judgments and fresh-reset comparisons.
Inspect `run-1/report.json` for rule checks and private witnesses.

Run an outcome regression check:

```sh
avalon trace-audit --data run-1/cases/corrected/snapshot.json --contract run-1/cases/corrected/contract.json
avalon trace-audit --data run-1/cases/false-completion/snapshot.json --contract run-1/cases/false-completion/contract.json
```

The corrected case returns code 0. The false-completion case returns code 4.
The trial command instead checks agreement with expected labels, so an expected failure does not fail its label comparison.

Replace the fictional workflow only after the team approves local use of its records.
Keep adapter observations independent from agent completion claims.
Keep this directory private. Reports and request records can contain raw data.
Do not commit it to a public repository.

The Python adapter supports describe, reset, observe, step, and judge requests.
The agent receives observations and returns one action per request.
Replace `agent.py` with the team's agent wrapper when ready.
The wrapper must enforce its own provider spending limits and report each call's USD cost.
Avalon stops after a reported budget excess. It cannot reverse a completed provider charge.

The saved source hashes cover the adapter and agent entry files.
Imported dependencies, model weights, and services require separate version records.
Replay requires unchanged entry files at their recorded paths.
It executes captured actions without calling the agent again.
