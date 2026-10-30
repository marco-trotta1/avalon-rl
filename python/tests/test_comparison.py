from dataclasses import replace
import os
from pathlib import Path

import pytest

from avalon_lab.comparison import exact_preserved, run_comparison, structural_valid
from avalon_lab.counter import record_counter
from avalon_lab.experiment import run_experiment
from avalon_lab.faults import FAULTS, inject_fault
from avalon_lab.learner import learner_snapshot
from avalon_lab.snapshot import read_snapshot, write_json, write_snapshot


def test_simple_exact_assertion_detects_all_five_selected_faults():
    source = record_counter(seed=7)
    recorded = replace(source, stage="recorded")
    assert structural_valid(recorded.to_dict())
    assert exact_preserved(source.to_dict(), learner_snapshot(recorded).to_dict())
    for fault in FAULTS:
        corrupted = inject_fault(recorded, fault=fault)
        assert structural_valid(corrupted.to_dict())
        assert not exact_preserved(source.to_dict(), corrupted.to_dict())


def test_snapshot_reader_roundtrips_and_rejects_unknown_step_fields(tmp_path):
    snapshot = record_counter(seed=7)
    path = tmp_path / "valid.json"
    write_snapshot(path, snapshot)
    assert read_snapshot(path) == snapshot
    value = snapshot.to_dict()
    value["episodes"][0]["steps"][0]["unknown"] = True
    invalid = tmp_path / "invalid.json"
    write_json(invalid, value)
    with pytest.raises(ValueError, match="documented"):
        read_snapshot(invalid)


@pytest.mark.skipif(not os.environ.get("AVALON_CLI"), reason="Set AVALON_CLI to an explicit built TypeScript entry point.")
def test_real_avalon_cli_against_executed_minari_pipeline(tmp_path):
    experiment = tmp_path / "experiment"
    run_experiment(output=experiment, seed=7)
    result = run_comparison(experiment=experiment, avalon_cli=Path(os.environ["AVALON_CLI"]), output=tmp_path / "comparison")
    assert len(result["results"]) == 12
    for row in result["results"]:
        expected = "fail" if row["expected_fault"] else "pass"
        assert row["exact"] == expected
        assert row["avalon"] == expected
        assert row["structural"] == "pass"
