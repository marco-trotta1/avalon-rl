# Local experiments

Run the Python preservation experiment from the repository root.
Use a new output directory for each run.

```sh
/tmp/avalon-venv/bin/avalon-python experiment --seed 7 --output /tmp/avalon-experiment-7
```

The command executes Gymnasium, Minari HDF5 storage, and NumPy TD updates.
It writes source, recorded, learner, and five controlled fault snapshots.
It also writes the learned table and a manifest.
The manifest records SHA-256 hashes, versions, seeds, transition counts, and measured stage latency.
Each latency measurement has one sample. The uncertainty is not estimated.
The command makes zero API calls. Its API cost is zero USD.
The local compute cost is not measured.
Two runs with one seed reproduce snapshot and table hashes.
Latency measurements vary between runs.
All evidence is synthetic.
Keep generated datasets and reports outside the repository.

## Compare the audit

Build the TypeScript CLI before the comparison.
Pass its exact local path to the explicit user runner.

```sh
avalon-python compare --experiment /tmp/avalon-experiment-7 --avalon-cli /absolute/path/dist/cli.js --output /tmp/avalon-comparison-7
AVALON_CLI=/absolute/path/dist/cli.js /tmp/avalon-venv/bin/python -m pytest python/tests/test_comparison.py
```

The runner starts the selected local Node CLI with an argument array.
It does not use a shell.
The TypeScript product does not start Python.
Each case compares the source with recorded and learner views.
The runner records audit exit codes, latency, and two named baselines.
The structural baseline checks required fields and finite rewards.
The exact assertion compares episode content and permits added learner masks.
Both baselines use the same snapshots as Avalon.
The exact assertion detects all five selected faults in the unit test.
This negative result prevents a detection-count advantage claim.
Five selected faults do not estimate a production detection rate.
The report records one latency sample per case and stage.
The uncertainty is not estimated. Avalon latency includes Node startup.
