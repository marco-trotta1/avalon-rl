# Executed Python counter experiment

The local run uses Python 3.13.5 and seed 7.
The exact dependency versions are in `python/requirements-tested.txt`.
The run executes Gymnasium 1.2.3, Minari 0.5.3, HDF5 storage, and NumPy 2.4.2 TD updates.
The dataset contains three episodes and eight transitions.
Two complete runs produce identical snapshot and learned-table hashes.
The source snapshot SHA-256 is `079f5a7119daffc9aa801046b1e80b73741229acf6b6984c18646576fb6d8eba`.

The comparison starts the explicitly selected local TypeScript audit CLI.
It checks the recorded and learner views separately.
The cases include one clean pipeline and five controlled faults.

| Method | Detected injected views | False alarms on clean views |
| --- | ---: | ---: |
| Structural field baseline | 0 of 10 | 0 of 2 |
| Exact episode assertion | 10 of 10 | 0 of 2 |
| Avalon audit | 10 of 10 | 0 of 2 |

The exact assertion matches Avalon on this selected fault set.
This result establishes no detection-count advantage over that baseline.
The five faults are selected examples. They do not estimate a production detection rate.
The uncertainty is not estimated.
The comparison records one latency sample for each method, case, and stage.
Avalon measurements include a new Node process for each audit.
The machine makes zero model API calls. The API cost is zero USD.
The local compute cost is not measured.

The local manifest records input hashes, module hashes, seeds, versions, and measured milliseconds.
Generated evidence stays outside the repository.
No native Gymnasium or Minari transition defect is established.
Initial dependency failures require explicit Pillow and CPU JAX installation.
The first dictionary export test exposes list-valued text observations.
The exporter now handles that representation explicitly.
The counter has one task family. It cannot support an independent family holdout.
The counter dataset has no environment spec.
Local export requires explicit serialized spaces and bypasses the path loader that can recover an environment.
