"""Check the actual learner, snapshot export, and Node trace contract together."""

import importlib.util
import json
import os
from pathlib import Path

import pytest


def test_actual_learned_trace_and_rewarded_restored_effect(tmp_path: Path) -> None:
    path = Path(__file__).resolve().parents[2] / "examples/policy/diagnose.py"
    specification = importlib.util.spec_from_file_location("avalon_diagnosis_example", path)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    cli = Path(os.environ["AVALON_CLI"])
    output = tmp_path / "diagnosis"
    report = module.diagnose(avalon_cli=cli, output=output)
    assert report["all_agree"]
    assert report["updates"] == 2400
    assert report["changed_updates"] > 0
    learned, restored = report["cases"]
    assert learned["independent_valid"] and learned["trace_status"] == "match"
    assert not restored["independent_valid"] and restored["trace_status"] == "mismatch"
    assert restored["proxy_return"] > 0
    assert restored["summary"]["rewardedMismatches"] == 1
    assert output.stat().st_mode & 0o777 == 0o700
    assert all(path.stat().st_mode & 0o777 == 0o600 for path in output.iterdir())
    original = (output / "report.json").read_bytes()
    with pytest.raises(FileExistsError):
        module.diagnose(avalon_cli=cli, output=output)
    assert (output / "report.json").read_bytes() == original
    assert json.loads(original)["policy_hash"] == report["policy_hash"]
