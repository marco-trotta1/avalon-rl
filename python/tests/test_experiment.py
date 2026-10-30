import hashlib
import json
import stat

import pytest

from avalon_lab.experiment import run_experiment


def test_real_experiment_reproduces_snapshots_and_records_measurements(tmp_path):
    first_path = tmp_path / "first"
    second_path = tmp_path / "second"
    first = run_experiment(output=first_path, seed=7)
    second = run_experiment(output=second_path, seed=7)
    assert first["sha256"] == second["sha256"]
    assert first["versions"]["minari"] == "0.5.3"
    assert first["latency"]["samples"] == 1
    assert all(value >= 0 for value in first["latency"]["measurements"].values())
    assert len(first["injected_faults"]) == 5
    for name, expected in first["sha256"].items():
        assert hashlib.sha256((first_path / name).read_bytes()).hexdigest() == expected
    for path in first_path.rglob("*"):
        if path.is_file():
            assert stat.S_IMODE(path.stat().st_mode) == 0o600
    source_before = (first_path / "source.json").read_bytes()
    with pytest.raises(FileExistsError):
        run_experiment(output=first_path, seed=8)
    assert (first_path / "source.json").read_bytes() == source_before
    assert json.loads(source_before)["evidence"] == "synthetic"
