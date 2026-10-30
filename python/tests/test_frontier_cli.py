"""Exercise local sampling commands through the installed module entry point."""

import json
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "examples/sampling/source.json"
TARGET = ROOT / "examples/sampling/target.json"


def run_cli(*arguments: str) -> subprocess.CompletedProcess[str]:
    environment = {**os.environ, "PYTHONPATH": str(ROOT / "python/src")}
    return subprocess.run([sys.executable, "-m", "avalon_lab.cli", *arguments], env=environment, capture_output=True, text=True, timeout=10)


def test_sampling_command_preserves_raw_inputs_and_existing_output(tmp_path: Path) -> None:
    output = tmp_path / "audit.json"
    before = SOURCE.read_bytes(), TARGET.read_bytes()
    result = run_cli("sampling-audit", "--source", str(SOURCE), "--target", str(TARGET), "--output", str(output))
    assert result.returncode == 4, result.stderr
    report = output.read_text()
    assert json.loads(report)["status"] == "fail"
    assert "raw_logits" not in report and "token_ids" not in report
    assert output.stat().st_mode & 0o777 == 0o600
    assert (SOURCE.read_bytes(), TARGET.read_bytes()) == before
    assert run_cli("sampling-audit", "--source", str(SOURCE), "--target", str(TARGET), "--output", str(output)).returncode == 1
    assert output.read_text() == report


def test_sampling_command_keeps_missing_evidence_unknown(tmp_path: Path) -> None:
    target = json.loads(TARGET.read_text())
    target["samples"][0]["support"] = {"kind": "unavailable", "reason": "The capture is absent."}
    target["samples"][0]["raw_logits"] = {"kind": "unavailable", "reason": "The capture is absent."}
    path = tmp_path / "target.json"
    path.write_text(json.dumps(target))
    output = tmp_path / "unknown.json"
    result = run_cli("sampling-audit", "--source", str(SOURCE), "--target", str(path), "--output", str(output))
    assert result.returncode == 5, result.stderr
    assert json.loads(output.read_text())["status"] == "inconclusive"


def test_sampling_witness_requires_a_selected_raw_token(tmp_path: Path) -> None:
    row = json.loads(SOURCE.read_text())["samples"][0]
    output = tmp_path / "witness.json"
    result = run_cli("sampling-witness", "--source", str(SOURCE), "--target", str(TARGET), "--sample", row["sample_id"], "--position", str(row["token_position"]), "--output", str(output))
    assert result.returncode == 0, result.stderr
    assert json.loads(output.read_text())["kind"] == "available"
    assert output.stat().st_mode & 0o777 == 0o600
    missing = run_cli("sampling-audit", "--source", str(tmp_path / "private-input.json"), "--target", str(TARGET), "--output", str(tmp_path / "absent.json"))
    assert missing.returncode == 1
    assert "private-input.json" not in missing.stderr
    assert "Traceback" not in missing.stderr
