"""Check project CLI boundaries with explicit fake benchmark execution."""
import json
import os
from pathlib import Path

import pytest

from avalon_lab import replay_project_cli as cli
from avalon_lab.replay_project_contract import parse_project, project_hash, project_to_dict
from avalon_lab.replay_project_demo import project_demo


@pytest.fixture
def project_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    data = project_to_dict(project_demo())
    data["task"]["snapshots"]["observed"]["helper.py"] = "VALUE = 7\n"
    project = parse_project(data)
    Path("avalon-project.json").write_text(json.dumps(data))
    Path("candidate.py").write_text("def act(observation):\n    return observation['target']\n")
    monkeypatch.setattr(cli, "validate_benchmark", lambda receipt: receipt)
    monkeypatch.setattr(cli, "render_episode_html", lambda report: "<main><p>" + report["status"] + "</p></main>")
    return project


def receipt_for(project, *, status="frozen", baseline_report=None):
    return {"project": project_to_dict(project), "project_hash": project_hash(project),
            "image_requested": "python:3.11.15-slim", "timeout_seconds": 5,
            "status": status, "baseline_report": baseline_report}


def save_receipt(project, *, status="frozen"):
    path = Path(".avalon/benchmark")
    path.mkdir(parents=True)
    receipt = receipt_for(project, status=status, baseline_report={"status": "accepted"})
    (path / "benchmark.json").write_text(json.dumps(receipt))
    return receipt


def test_demo_creates_private_project_and_preserves_existing_output(tmp_path):
    output = tmp_path / "demo"
    assert cli.main(["project-demo", "--output", str(output)]) == 0
    assert (output.stat().st_mode & 0o777) == 0o700
    for name in ("avalon-project.json", "candidate.py", "baseline.py"):
        assert ((output / name).stat().st_mode & 0o777) == 0o600
    before = (output / "avalon-project.json").read_bytes()
    with pytest.raises(SystemExit):
        cli.main(["project-demo", "--output", str(output)])
    assert (output / "avalon-project.json").read_bytes() == before


def test_freeze_defaults_capture_once_and_reuse_without_execution(project_files, monkeypatch):
    calls = []
    def freeze(project, **kwargs):
        calls.append((project, kwargs))
        return receipt_for(project, baseline_report={"status": "accepted"})
    monkeypatch.setattr(cli, "freeze_benchmark", freeze)
    assert cli.main(["freeze"]) == 0
    assert cli.main(["freeze"]) == 0
    assert len(calls) == 1
    receipt = Path(".avalon/benchmark/benchmark.json")
    assert (receipt.stat().st_mode & 0o777) == 0o600
    assert json.loads(receipt.read_text())["project_hash"] == project_hash(project_files)


@pytest.mark.parametrize("change", ["project", "image", "timeout"])
def test_freeze_rejects_changed_inputs_at_existing_path(project_files, monkeypatch, change):
    save_receipt(project_files)
    def unexpected(*args, **kwargs):
        pytest.fail("An existing benchmark must not run again.")
    monkeypatch.setattr(cli, "freeze_benchmark", unexpected)
    argv = ["freeze"]
    if change == "project":
        data = project_to_dict(project_files)
        data["brief"] = "Another requested outcome."
        Path("avalon-project.json").write_text(json.dumps(data))
    elif change == "image":
        argv += ["--image", "another-image"]
    else:
        argv += ["--timeout", "6"]
    with pytest.raises(SystemExit) as error:
        cli.main(argv)
    assert error.value.code == 1


def test_freeze_preserves_runtime_failure_without_rendering_missing_report(project_files, monkeypatch):
    monkeypatch.setattr(cli, "freeze_benchmark", lambda project, **kwargs: receipt_for(project, status="inconclusive"))
    assert cli.main(["freeze"]) == 5
    receipt = json.loads(Path(".avalon/benchmark/benchmark.json").read_text())
    assert receipt["status"] == "inconclusive"
    assert receipt["baseline_report"] is None


def test_cached_inconclusive_freeze_does_not_report_success(project_files, monkeypatch, capsys):
    save_receipt(project_files, status="inconclusive")
    def reject(receipt):
        assert receipt["status"] == "inconclusive"
        raise ValueError("Compare only a frozen benchmark.")
    monkeypatch.setattr(cli, "validate_benchmark", reject)
    with pytest.raises(SystemExit) as error:
        cli.main(["freeze"])
    assert error.value.code == 1
    assert "Reuse the frozen baseline" not in capsys.readouterr().out


@pytest.mark.parametrize("command,split", [("develop", "development"), ("compare", "holdout")])
def test_policy_source_preserves_observed_helpers_and_routes_split(project_files, monkeypatch, command, split):
    save_receipt(project_files)
    calls = []
    def compare(receipt, candidates, **kwargs):
        calls.append((candidates, kwargs))
        return {"status": "accepted", "candidate_report": {"status": "accepted"}, "paired_deltas": [
            {"relative_outcome": "higher-return", "id": name, "pairs": [{"id": "case-7", "baseline_return": 1.0, "candidate_return": 2.0, "return_delta": 1.0}]}
            for name in candidates]}
    monkeypatch.setattr(cli, "compare_benchmark", compare)
    assert cli.main([command, "--candidate", "repair=candidate.py"]) == 0
    assert calls[0][1]["split"] == split
    assert calls[0][0]["repair"]["helper.py"] == "VALUE = 7\n"
    assert calls[0][0]["repair"]["policy.py"] == Path("candidate.py").read_text()
    reports = list(Path(".avalon/results").glob("*/report.json"))
    assert len(reports) == 1
    assert (reports[0].stat().st_mode & 0o777) == 0o600


def test_final_compare_rejects_multiple_candidates_before_execution(project_files, monkeypatch):
    save_receipt(project_files)
    def unexpected(*args, **kwargs):
        pytest.fail("Multiple final candidates must not execute.")
    monkeypatch.setattr(cli, "compare_benchmark", unexpected)
    with pytest.raises(SystemExit) as error:
        cli.main(["compare", "--candidate", "a=candidate.py", "--candidate", "b=candidate.py"])
    assert error.value.code == 1
    assert not Path(".avalon/results").exists()


@pytest.mark.parametrize("kind", ["symlink", "fifo", "oversized"])
def test_candidate_reader_rejects_unsafe_inputs_before_execution(project_files, monkeypatch, kind):
    save_receipt(project_files)
    bad = Path("bad.py")
    if kind == "symlink":
        bad.symlink_to("candidate.py")
    elif kind == "fifo":
        os.mkfifo(bad)
    else:
        bad.write_text("x" * 65_537)
    def unexpected(*args, **kwargs):
        pytest.fail("An invalid candidate must not execute.")
    monkeypatch.setattr(cli, "compare_benchmark", unexpected)
    with pytest.raises(SystemExit) as error:
        cli.main(["develop", "--candidate", f"bad={bad}"])
    assert error.value.code == 1
    assert not Path(".avalon/results").exists()


def test_develop_accepts_multiple_candidates_and_uses_new_private_outputs(project_files, monkeypatch):
    save_receipt(project_files)
    calls = []
    def compare(receipt, candidates, **kwargs):
        calls.append((candidates, kwargs))
        return {"status": "accepted", "candidate_report": {"status": "accepted"}, "paired_deltas": [
            {"relative_outcome": "higher-return", "id": name, "pairs": [{"id": "case-7", "baseline_return": 1.0, "candidate_return": 2.0, "return_delta": 1.0}]}
            for name in candidates]}
    monkeypatch.setattr(cli, "compare_benchmark", compare)
    for _ in range(2):
        assert cli.main(["develop", "--candidate", "first=candidate.py", "--candidate", "second=candidate.py"]) == 0
    assert all(set(candidates) == {"first", "second"} and options["split"] == "development"
               for candidates, options in calls)
    directories = list(Path(".avalon/results").iterdir())
    assert len(directories) == 2
    assert all((path.stat().st_mode & 0o777) == 0o700 for path in directories)


def test_top_level_replay_command_dispatches_project_demo(tmp_path):
    from avalon_lab.replay_cli import main
    output = tmp_path / "project"
    assert main(["project-demo", "--output", str(output)]) == 0
    assert (output / "avalon-project.json").is_file()


def test_comparison_html_displays_paired_baseline_and_escapes_identifiers(project_files):
    report = {"candidate_report": {"status": "accepted"}, "paired_deltas": [
        {"relative_outcome": "higher-return", "id": "<script>candidate</script>", "pairs": [
            {"id": "<b>case</b>", "baseline_return": 1.0, "candidate_return": 2.0, "return_delta": 1.0}]}]}
    rendered = cli._comparison_html(report)
    assert "Compared with the frozen current process" in rendered
    assert "Frozen baseline" in rendered
    assert "Candidate return" in rendered
    assert "Return delta" in rendered
    assert "<script>" not in rendered and "<b>" not in rendered
    assert "&lt;script&gt;candidate&lt;/script&gt;" in rendered
    assert "&lt;b&gt;case&lt;/b&gt;" in rendered
    assert "<td>1.0</td><td>2.0</td><td>1.0</td>" in rendered


def test_bounded_writer_counts_the_actual_formatted_bytes(tmp_path, monkeypatch):
    value = {"nested": {"message": "hello"}}
    compact_size = len(json.dumps(value).encode())
    monkeypatch.setattr(cli, "MAX_BYTES", compact_size)
    path = tmp_path / "bounded.json"
    with pytest.raises(ValueError):
        cli._bounded_write(path, value)
    assert not path.exists()
