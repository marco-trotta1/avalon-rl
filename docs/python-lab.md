# Python laboratory

The Python package records local synthetic Gymnasium experience.
Python 3.13.5 is the tested interpreter.
The package pins Gymnasium 1.2.3 and NumPy 2.4.2.

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
