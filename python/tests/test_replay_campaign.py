"""Campaign policy tests use an explicit fake executor, not Docker evidence."""

from dataclasses import replace

import pytest

from avalon_lab import replay_campaign as campaign
from avalon_lab.replay_contract import parse_replay_task


@pytest.fixture
def task():
    return parse_replay_task({
        "format": "avalon.replay.v1", "id": "example-task", "family_id": "example-family", "title": "Example repair",
        "description": "An explicit fake executor supplies outcomes for these unit tests.",
        "provenance": {"source": "synthetic", "model": "test-fixture", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"}, "entrypoint": {"file": "main.py", "function": "repair"},
        "snapshots": {"initial": {"main.py": "initial"}, "observed": {"main.py": "observed"}, "reference": {"main.py": "reference"}},
        "tests": [{"id": "dev", "split": "development", "args": [1], "kwargs": {}, "expected": 1},
                  {"id": "held", "split": "holdout", "args": [2], "kwargs": {}, "expected": 2}],
        "protected_paths": [],
        "controls": [{"id": "positive", "expect": "pass", "files": {"main.py": "positive"}},
                     {"id": "negative", "expect": "fail", "files": {"main.py": "negative"}}],
    })


def fake_executor(monkeypatch, outcomes=None):
    outcomes = {"observed": "fail", "reference": "pass", "positive": "pass", "negative": "fail",
                "repair": "pass", "broken": "fail", **(outcomes or {})}
    calls = []

    def execute(task, files, image, timeout_seconds):
        calls.append((dict(files), image, timeout_seconds))
        outcome = outcomes[files["main.py"]]
        if isinstance(outcome, Exception):
            raise outcome
        statuses = outcome if isinstance(outcome, dict) else {test.id: outcome for test in task.tests}
        status = "inconclusive" if "inconclusive" in statuses.values() else "fail" if "fail" in statuses.values() else "pass"
        return {
            "format": "avalon.replay-run.v1", "status": status, "task_hash": "a" * 64,
            "candidate_hash": campaign._snapshot_hash(files), "image_id": "sha256:" + "b" * 64,
            "protected_checks": [], "test_results": [
                {"id": test.id, "split": test.split, "status": statuses[test.id], "reason": "fake-executor-result",
                 "wall_ms": 1.0, "stdout_sha256": "c" * 64} for test in task.tests],
            "wall_ms": 2.0, "limits": ["This receipt comes from a unit test fake executor."],
        }

    monkeypatch.setattr(campaign, "run_snapshot", execute)
    return calls


def test_validates_controls_then_accepts_a_supplied_repair(task, monkeypatch):
    calls = fake_executor(monkeypatch)
    report = campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python")
    assert report["status"] == "accepted"
    assert report["grader"] == {"status": "accepted", "reasons": []}
    assert [call[0]["main.py"] for call in calls] == ["observed", "reference", "positive", "negative", "repair"]
    assert calls[0][1] == "local-python"
    assert all(call[1] == "sha256:" + "b" * 64 for call in calls[1:])
    candidate = report["candidates"][0]
    assert candidate["development"] == {"total": 1, "passed": 1, "failed": 0, "inconclusive": 0}
    assert candidate["holdout"] == candidate["development"]
    assert candidate["pass_count_change"] == {"development": 1, "holdout": 1}
    assert report["baseline_counts"]["holdout"]["failed"] == 1
    assert report["measurement"]["model_api_cost_usd"] == 0
    assert report["measurement"]["compute_cost_usd"] is None
    assert report["measurement"]["samples_per_snapshot"] == 1


@pytest.mark.parametrize(("changed", "status", "decision"), [
    ("observed", "pass", "rejected"), ("reference", "fail", "rejected"),
    ("positive", "fail", "rejected"), ("negative", "pass", "rejected"),
    ("negative", "inconclusive", "inconclusive"), ("reference", "inconclusive", "inconclusive"),
])
def test_grader_defects_prevent_candidate_acceptance(task, monkeypatch, changed, status, decision):
    calls = fake_executor(monkeypatch, {changed: status})
    report = campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python")
    assert report["grader"]["status"] == decision
    assert report["status"] == decision
    assert report["candidates"][0]["status"] == decision
    assert len(calls) == 5
    assert len(report["controls"]) == 2
    assert report["grader"]["reasons"]


def test_startup_errors_remain_inconclusive_without_dropping_runs(task, monkeypatch):
    calls = fake_executor(monkeypatch, {"negative": RuntimeError("Private daemon detail")})
    report = campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python")
    assert report["status"] == "inconclusive"
    assert len(calls) == 5
    negative = report["controls"][1]["run"]
    assert negative["status"] == "inconclusive"
    assert len(negative["test_results"]) == 2
    assert all(test["reason"] == "runner-startup-error" for test in negative["test_results"])
    assert "Private daemon detail" not in str(report)


@pytest.mark.parametrize("explicit_flag", [True, False])
def test_unconfirmed_cleanup_stops_all_later_execution(task, monkeypatch, explicit_flag):
    calls = fake_executor(monkeypatch)
    executor = campaign.run_snapshot

    def uncertain_cleanup(frozen, files, **options):
        receipt = executor(frozen, files, **options)
        receipt["status"] = "inconclusive"
        if explicit_flag:
            receipt["cleanup_blocked"] = True
        receipt["test_results"][0].update(status="inconclusive", reason="cleanup-unconfirmed",
                                           cleanup_confirmed=False, container_name="avalon-replay-outstanding")
        return receipt

    monkeypatch.setattr(campaign, "run_snapshot", uncertain_cleanup)
    report = campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python")
    assert len(calls) == 1
    assert report["status"] == "inconclusive"
    assert report["cleanup_blocked"] is True
    assert report["outstanding_containers"] == ["avalon-replay-outstanding"]
    remaining = [report["reference"], *[control["run"] for control in report["controls"]], report["candidates"][0]["run"]]
    for receipt in remaining:
        assert receipt["status"] == "inconclusive"
        assert len(receipt["test_results"]) == 2
        assert all(test["reason"] == "prior-cleanup-unconfirmed" for test in receipt["test_results"])
        assert receipt["wall_ms"] == 0.0
    assert report["grader"]["status"] == "inconclusive"
    assert report["candidates"][0]["holdout"]["inconclusive"] == 1
    html = campaign.render_campaign_html(report)
    assert "Container cleanup requires attention" in html
    assert "avalon-replay-outstanding" in html


def test_retains_failed_candidates_and_incomplete_denominators(task, monkeypatch):
    fake_executor(monkeypatch, {"repair": "inconclusive"})
    report = campaign.run_campaign(task, {"broken": {"main.py": "broken"}, "incomplete": {"main.py": "repair"}}, image="local-python")
    assert report["status"] == "rejected"
    assert [item["status"] for item in report["candidates"]] == ["rejected", "inconclusive"]
    assert report["candidates"][1]["holdout"] == {"total": 1, "passed": 0, "failed": 0, "inconclusive": 1}
    assert report["baseline"]["status"] == "fail"


def test_requires_positive_and_negative_controls(task, monkeypatch):
    fake_executor(monkeypatch)
    task = replace(task, controls=task.controls[:1])
    with pytest.raises(ValueError, match="passing and failing controls"):
        campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python")


def test_rejects_a_repair_that_only_passes_development_tests(task, monkeypatch):
    fake_executor(monkeypatch, {"repair": {"dev": "pass", "held": "fail"}})
    report = campaign.run_campaign(task, {"overfit": {"main.py": "repair"}}, image="local-python")
    candidate = report["candidates"][0]
    assert report["reference"]["status"] == "pass"
    assert candidate["status"] == "rejected"
    assert candidate["development"]["passed"] == 1
    assert candidate["holdout"]["passed"] == 0
    assert candidate["holdout"]["failed"] == 1


def test_freezes_nested_task_inputs_and_candidates_before_execution(task, monkeypatch):
    fake_executor(monkeypatch)
    executor = campaign.run_snapshot
    candidates = {"candidate": {"main.py": "repair"}}
    seen = []

    def mutate_original(frozen, files, **options):
        task.tests[0].kwargs["external"] = 42
        candidates["candidate"]["main.py"] = "broken"
        seen.append(dict(frozen.tests[0].kwargs))
        return executor(frozen, files, **options)

    monkeypatch.setattr(campaign, "run_snapshot", mutate_original)
    report = campaign.run_campaign(task, candidates, image="local-python")
    assert report["status"] == "accepted"
    assert seen == [{}] * 5


def test_rejects_invalid_campaign_options_before_execution(task, monkeypatch):
    calls = fake_executor(monkeypatch)
    with pytest.raises(ValueError, match="at least one"):
        campaign.run_campaign(task, {}, image="local-python")
    for timeout in (0, 61, True, 1.5):
        with pytest.raises(ValueError, match="integer timeout"):
            campaign.run_campaign(task, {"candidate": {"main.py": "repair"}}, image="local-python", timeout_seconds=timeout)
    assert calls == []


def test_html_escapes_all_user_labels_and_keeps_full_evidence(task, monkeypatch):
    fake_executor(monkeypatch)
    attack = '</h1><script>alert("secret")</script>'
    task = replace(task, title=attack)
    report = campaign.run_campaign(task, {attack: {"main.py": "repair"}}, image="local-python")
    report["controls"][0]["id"] = attack
    report["limits"].append(attack)
    html = campaign.render_campaign_html(report)
    assert attack not in html
    assert "<script" not in html
    assert "&lt;script&gt;" in html
    assert "Complete campaign evidence" in html
    assert "fake-executor-result" in html
    assert "default-src 'none'" in html
    assert "https://" not in html
