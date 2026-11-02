"""Check Replay files and argument boundaries without a Docker daemon."""

import json
from pathlib import Path

import pytest

from avalon_lab.replay_cli import main, read_json


def test_demo_is_private_and_preserves_existing_output(tmp_path: Path):
    output = tmp_path / "demo"
    assert main(["demo", "--output", str(output)]) == 0
    assert (output.stat().st_mode & 0o777) == 0o700
    assert ((output / "task.json").stat().st_mode & 0o777) == 0o600
    assert main(["validate", "--task", str(output / "task.json")]) == 0
    content = (output / "task.json").read_bytes()
    with pytest.raises(SystemExit) as error:
        main(["demo", "--output", str(output)])
    assert error.value.code == 1
    assert (output / "task.json").read_bytes() == content


@pytest.mark.parametrize("payload", ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'])
def test_json_reader_rejects_ambiguous_values(tmp_path: Path, payload: str):
    path = tmp_path / "input.json"
    path.write_text(payload)
    with pytest.raises(ValueError):
        read_json(path)


def test_json_reader_rejects_links_and_fifos(tmp_path: Path):
    import os
    path = tmp_path / "data.json"
    path.write_text("{}")
    link = tmp_path / "link"
    link.symlink_to(path)
    with pytest.raises(OSError):
        read_json(link)
    fifo = tmp_path / "fifo"
    os.mkfifo(fifo)
    with pytest.raises(ValueError):
        read_json(fifo)


def test_rejects_unsafe_candidate_before_creating_output(tmp_path: Path):
    output = tmp_path / "demo"
    assert main(["demo", "--output", str(output)]) == 0
    candidate = tmp_path / "bad.json"
    candidate.write_text(json.dumps({"../outside.py": "x"}))
    report = tmp_path / "report"
    with pytest.raises(SystemExit):
        main(["run", "--task", str(output / "task.json"), "--candidate", f"bad={candidate}", "--output", str(report)])
    assert not report.exists()


def test_json_reader_rejects_overflowed_number(tmp_path: Path):
    path = tmp_path / "overflow.json"
    path.write_text('{"value":1e999}')
    with pytest.raises(ValueError):
        read_json(path)
