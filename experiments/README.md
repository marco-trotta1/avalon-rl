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
