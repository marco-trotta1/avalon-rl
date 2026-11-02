"""Run the project command workflow with real isolated worlds and policies."""

import json
import os

import pytest

from avalon_lab.replay_cli import main


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker benchmark tests explicitly.")
def test_real_docker_freeze_develop_compare_preserves_original_benchmark(tmp_path):
    project_dir = tmp_path / "project"
    benchmark_dir = tmp_path / "benchmark"
    assert main(["project-demo", "--output", str(project_dir)]) == 0
    project_path = project_dir / "avalon-project.json"
    freeze = ["freeze", "--project", str(project_path), "--output", str(benchmark_dir)]
    assert main(freeze) == 0
    frozen_bytes = (benchmark_dir / "benchmark.json").read_bytes()
    receipt = json.loads(frozen_bytes)
    assert receipt["status"] == "frozen"
    assert receipt["baseline_report"]["baseline"]["status"] == "fail"
    assert main(freeze) == 0
    assert (benchmark_dir / "benchmark.json").read_bytes() == frozen_bytes
    development = tmp_path / "development"
    assert main(["develop", "--benchmark", str(benchmark_dir), "--candidate", str(project_dir / "candidate.py"),
                 "--output", str(development)]) == 0
    dev_report = json.loads((development / "report.json").read_text())
    assert dev_report["candidate_report"]["evaluated_split"] == "development"
    assert all(row["split"] == "development" for row in dev_report["baseline"]["episodes"])
    changed = json.loads(project_path.read_text())
    changed["task"]["min_return"] = 999
    project_path.write_text(json.dumps(changed))
    with pytest.raises(SystemExit):
        main(freeze)
    final = tmp_path / "comparison"
    assert main(["compare", "--benchmark", str(benchmark_dir), "--candidate", str(project_dir / "candidate.py"),
                 "--output", str(final)]) == 0
    report = json.loads((final / "report.json").read_text())
    assert report["candidate_report"]["evaluated_split"] == "holdout"
    assert report["benchmark_hash"] == receipt["benchmark_hash"]
    assert report["paired_deltas"][0]["mean_return_delta"] == pytest.approx(1.0)
    assert report["paired_deltas"][0]["complete_pairs"] == 2
    assert "Frozen baseline" in (final / "report.html").read_text()
    assert (benchmark_dir / "benchmark.json").read_bytes() == frozen_bytes
