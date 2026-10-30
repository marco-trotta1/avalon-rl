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
