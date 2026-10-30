# Python laboratory

The Python package records local synthetic Gymnasium experience.
Python 3.13.5 is the tested interpreter.
The package pins Gymnasium 1.2.3 and NumPy 2.4.2.
The Minari bridge pins Minari 0.5.3 and h5py 3.16.0.
It also pins Pillow 12.1.0 for the Minari HDF5 import.
Minari collection requires CPU JAX 0.8.2 and jaxlib 0.8.2.

```sh
python3 -m venv /tmp/avalon-venv
/tmp/avalon-venv/bin/pip install -e './python[test]'
/tmp/avalon-venv/bin/avalon-python record-counter --seed 7 --output /tmp/source.json
/tmp/avalon-venv/bin/python -m pytest python/tests
```

The counter emits termination, truncation, and simultaneous ending signals.
The recorder preserves the final observation before the next reset.
The output uses the Avalon snapshot contract.
Files use mode `0600` and exclusive creation.
An existing output causes an error.
The environment checker and deterministic recording tests run locally.
These tests establish synthetic preservation behavior only.

The implementation follows the official [Gymnasium time limit guide](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/).
Termination disables bootstrapping.
An external time limit permits bootstrapping under the infinite horizon convention.

## Minari storage

`collect_counter(root=Path(...), seed=7)` runs the real Minari `DataCollector`.
It saves an HDF5 dataset and reopens it with `minari.load_dataset(download=False)`.
The export reads the reopened transition arrays.
Episode identifiers, step indices, and categorical metadata use Minari episode attributes.
The bridge selects the local dataset root for the synchronous operation.
Do not call the bridge concurrently within one Python process.
It does not download datasets or recover environment code.
The real save and load test compares all transitions and categorical metadata.
The official [Minari collector reference](https://minari.farama.org/api/data_collector/) describes the upstream storage API.
The current online reference includes features absent from pinned Minari 0.5.3.
The implementation also inspects the installed API.
The first storage test fails because the HDF5 import requires Pillow.
Installing the explicit Pillow dependency resolves this local setup gap.
The next collection test requires the optional JAX dependency.
The package declares both runtime dependencies explicitly.
`python/requirements-tested.txt` records the complete installed dependency versions.
Minari warns about the absent environment spec, contact email, and code permalink.
The dataset preserves transitions, but automatic environment recovery is unavailable.

## NumPy learner

`learner_snapshot(recorded)` converts rewards and both ending signals through explicit NumPy arrays.
It preserves episode identity, indices, observations, actions, and categorical metadata.
It sets `bootstrap_mask` to `0` for termination and `1` otherwise.
Simultaneous termination and truncation therefore use mask `0`.
`train_counter(learner)` executes tabular TD updates on bounded scalar counter states.
It initializes the table to one and uses ten deterministic passes by default.
The tests check all four ending cases and execute reproducible training.
The table demonstrates learner execution. It does not establish policy quality.

## Controlled faults

`inject_fault(snapshot, fault=...)` supports five controlled faults:

- `drop-transition` removes the first transition and preserves the remaining indices.
- `reward-shift` adds one to the first reward.
- `reset-observation` replaces the final observation with the initial observation.
- `collapsed-flags` converts a truncation into a termination.
- `stale-metadata` changes the mission category.

Each output names the injected fault in its producer label.
The function preserves the source and accepts synthetic evidence only.
The tests compare the source bytes before and after each injection.
These faults simulate integration failures. They are not observed Minari defects.

## Reproducible command

`avalon-python experiment --seed 7 --output /tmp/avalon-run-7` executes the complete local pipeline.
Use a new directory. The command refuses an existing directory.
All generated files use mode `0600` inside a directory with mode `0700`.
The manifest identifies controlled faults separately from upstream defects.
See [the experiment procedure](../experiments/README.md) for measurements and limits.

## Dataset split

`split_grouped(snapshot, seed=7)` holds out complete task families.
It returns train and evaluation snapshots without changing episodes or step indices.
Episode identifiers must be unique.
Every episode must declare the `task_family` metadata field.
Use `group_keys=("task_family", "site", "year")` for site and time data.
Shared values connect groups transitively across every declared key.
The splitter rejects missing group values and datasets with only one independent group.
The counter experiment has one family. It therefore cannot provide an independent holdout.
The tests check episode preservation and group separation across twenty split seeds.
The held-out fraction applies to groups. It does not promise an exact transition ratio.
