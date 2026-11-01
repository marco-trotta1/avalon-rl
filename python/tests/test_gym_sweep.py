"""Check frozen sweep evidence and preserve failed executions."""

import hashlib
import json
import os
import subprocess
import sys

import pytest

from avalon_lab.gym_sweep import read_sweep_config, run_sweep


def config_document():
    return {
        "format": "avalon-gym-sweep-v1",
        "evaluation": {"seed": 1001, "episodes": 3, "maxSteps": 8},
        "delta": 0.05,
        "minImprovement": 0,
        "candidates": [
            {"id": "small", "seed": 7, "episodes": 2, "maxSteps": 5, "learningRate": 0.005, "discount": 0.99},
            {"id": "large", "seed": 20, "episodes": 2, "maxSteps": 5, "learningRate": 0.01, "discount": 0.99},
        ],
    }


def write_config(tmp_path, value=None):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config_document() if value is None else value))
    return path


def test_real_sweep_freezes_every_checkpoint_before_any_evaluation(tmp_path, monkeypatch):
    import avalon_lab.gym_sweep as sweep

    source = write_config(tmp_path)
    before = source.read_bytes()
    output = tmp_path / "sweep"
    original = sweep.evaluate_checkpoint
    calls = []

    def evaluate(**arguments):
        plan_path = output / "selection-plan.json"
        assert plan_path.is_file()
        plan = json.loads(plan_path.read_text())
        assert all((output / "candidates" / name / "checkpoint.json").is_file() for name in ("small", "large"))
        for item in plan["candidates"][1:]:
            checkpoint = output / "candidates" / item["id"] / "checkpoint.json"
            assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == item["artifactSha256"]
        calls.append(arguments)
        return original(**arguments)

    monkeypatch.setattr(sweep, "evaluate_checkpoint", evaluate)
    report = run_sweep(config_path=source, output=output)
    assert report["status"] == "complete"
    assert len(calls) == 2
    assert calls[0]["seeds"] == calls[1]["seeds"]
    assert len(set(calls[0]["seeds"])) == 3
    assert not set(calls[0]["seeds"]) & {7, 8, 20, 21}
    plan_path = output / "selection-plan.json"
    plan = json.loads(plan_path.read_text())
    scores = json.loads((output / "selection-scores.json").read_text())
    assert plan["format"] == "avalon-selection-plan-v1"
    assert plan["sampling"]["assumption"] == "uniform-without-replacement"
    assert plan["sampling"]["sampleIds"] == [str(seed) for seed in calls[0]["seeds"]]
    assert plan["metric"] == {"name": "episode-return", "lower": 0, "upper": 8, "direction": "maximize"}
    assert scores["planSha256"] == hashlib.sha256(plan_path.read_bytes()).hexdigest()
    assert [item["id"] for item in scores["candidates"]] == ["random", "small", "large"]
    first_evaluation = json.loads((output / "candidates/small/evaluation.json").read_text())
    assert [item["value"] for item in scores["candidates"][0]["samples"]] == first_evaluation["policies"]["uniform-random"]["returns"]
    assert all(item["status"] == "complete" and item["latencyMs"] >= 0 for item in scores["candidates"])
    assert all(item["cost"] == {"externalApiUsd": 0, "computeUsd": None, "hostAgentUsd": None} for item in scores["candidates"])
    assert source.read_bytes() == before
    assert output.stat().st_mode & 0o777 == 0o700
    assert all(path.stat().st_mode & 0o777 == 0o600 for path in output.rglob("*.json"))


@pytest.mark.parametrize("mutation", ["unknown", "candidate-id", "duplicate", "reserved", "boolean", "budget", "candidate-count", "nonfinite", "evaluation-count"])
def test_invalid_sweep_config_fails_before_output(tmp_path, mutation):
    value = config_document()
    if mutation == "unknown":
        value["command"] = "execute"
    elif mutation == "candidate-id":
        value["candidates"][0]["id"] = "../escape"
    elif mutation == "duplicate":
        value["candidates"][1]["id"] = "small"
    elif mutation == "reserved":
        value["candidates"][0]["id"] = "random"
    elif mutation == "boolean":
        value["evaluation"]["seed"] = True
    elif mutation == "budget":
        value["candidates"] = [dict(value["candidates"][0], id=f"candidate-{index}", episodes=100, maxSteps=200) for index in range(5)]
    elif mutation == "candidate-count":
        value["candidates"] = [dict(value["candidates"][0], id=f"candidate-{index}") for index in range(9)]
    elif mutation == "nonfinite":
        value["delta"] = float("nan")
    else:
        value["evaluation"]["episodes"] = 65
    with pytest.raises(ValueError):
        run_sweep(config_path=write_config(tmp_path, value), output=tmp_path / "absent")
    assert not (tmp_path / "absent").exists()


def test_config_reader_rejects_duplicate_keys_and_special_files(tmp_path):
    duplicate = tmp_path / "duplicate.json"
    duplicate.write_text('{"format":"a","format":"b"}')
    with pytest.raises(ValueError, match="duplicate"):
        read_sweep_config(duplicate)
    linked = tmp_path / "linked.json"
    linked.symlink_to(write_config(tmp_path))
    with pytest.raises(OSError):
        read_sweep_config(linked)
    fifo = tmp_path / "fifo"
    os.mkfifo(fifo)
    with pytest.raises(ValueError, match="regular"):
        read_sweep_config(fifo)


def test_failed_evaluation_retains_all_training_and_failed_score(tmp_path, monkeypatch):
    import avalon_lab.gym_sweep as sweep

    original = sweep.evaluate_checkpoint

    def evaluate(**arguments):
        if arguments["checkpoint"].parent.name == "large":
            raise RuntimeError("Injected evaluation failure.")
        return original(**arguments)

    monkeypatch.setattr(sweep, "evaluate_checkpoint", evaluate)
    output = tmp_path / "failed"
    report = run_sweep(config_path=write_config(tmp_path), output=output)
    assert report["status"] == "failed"
    assert (output / "candidates/large/checkpoint.json").is_file()
    assert (output / "candidates/small/evaluation.json").is_file()
    scores = json.loads((output / "selection-scores.json").read_text())
    assert [item["status"] for item in scores["candidates"]] == ["complete", "complete", "failed"]
    assert "samples" not in scores["candidates"][2]
    assert (output / "failure.json").is_file()


def test_training_failure_preserves_partial_artifacts_without_selection(tmp_path, monkeypatch):
    import avalon_lab.gym_sweep as sweep

    original = sweep.train_policy

    def train(**arguments):
        if arguments["output"].name == "large":
            raise RuntimeError("Injected training failure.")
        return original(**arguments)

    monkeypatch.setattr(sweep, "train_policy", train)
    output = tmp_path / "failed"
    report = run_sweep(config_path=write_config(tmp_path), output=output)
    assert report["status"] == "failed"
    assert report["phase"] == "training"
    assert (output / "candidates/small/checkpoint.json").is_file()
    assert not (output / "selection-plan.json").exists()
    assert (output / "failure.json").is_file()


def test_changed_checkpoint_identity_cannot_produce_complete_scores(tmp_path, monkeypatch):
    import avalon_lab.gym_sweep as sweep

    original = sweep.evaluate_checkpoint

    def evaluate(**arguments):
        result = original(**arguments)
        result["policy_sha256"] = "0" * 64
        return result

    monkeypatch.setattr(sweep, "evaluate_checkpoint", evaluate)
    output = tmp_path / "changed"
    report = run_sweep(config_path=write_config(tmp_path), output=output)
    assert report["status"] == "failed"
    scores = json.loads((output / "selection-scores.json").read_text())
    assert all(item["status"] == "failed" for item in scores["candidates"])
    assert all("samples" not in item for item in scores["candidates"])


def test_failed_sweep_returns_a_nonzero_cli_status(tmp_path, monkeypatch, capsys):
    from argparse import Namespace
    from avalon_lab.agent_cli import dispatch_agent_command
    import avalon_lab.gym_sweep as sweep

    def fail(**arguments):
        raise RuntimeError("Injected training failure.")

    monkeypatch.setattr(sweep, "train_policy", fail)
    output = tmp_path / "failed-cli"
    result = dispatch_agent_command(Namespace(command="gym-sweep", config=write_config(tmp_path), output=output))
    assert result == 1
    assert json.loads(capsys.readouterr().out)["status"] == "failed"
    assert (output / "failure.json").is_file()


def test_sweep_cli_preserves_existing_outputs_and_reports_negative_results(tmp_path):
    source = write_config(tmp_path)
    output = tmp_path / "cli"
    arguments = [sys.executable, "-m", "avalon_lab.agent_cli", "gym-sweep", "--config", str(source), "--output", str(output)]
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    report_before = (output / "report.json").read_bytes()
    repeated = subprocess.run(arguments, capture_output=True, text=True, timeout=30)
    assert repeated.returncode == 1
    assert (output / "report.json").read_bytes() == report_before
