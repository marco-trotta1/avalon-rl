"""Runner controls and optional real Docker execution tests."""

import os
import sys

import pytest

from avalon_lab.replay_runner import OUTPUT_LIMIT, _bounded_process, _docker_argv, _parse_output, _values_equal, run_snapshot


def test_container_controls_and_no_host_mounts():
    argv = _docker_argv(image_id="sha256:" + "a" * 64, name="test-container", endpoint="unix:///tmp/docker.sock")
    for flag, value in (("--network", "none"), ("--cap-drop", "ALL"), ("--security-opt", "no-new-privileges"),
                        ("--pids-limit", "32"), ("--memory", "128m"), ("--user", "65534:65534"), ("--pull", "never")):
        assert argv[argv.index(flag) + 1] == value
    assert "--read-only" in argv
    assert "--mount" not in argv and "-v" not in argv


@pytest.mark.parametrize("raw", [b'{"result":1,"result":2,"protected":{}}', b'{"result":NaN,"protected":{}}',
                                   b'{"result":1,"protected":{}}\n{"result":2,"protected":{}}', b'{}'])
def test_protocol_rejects_ambiguous_or_nonfinite_results(raw):
    with pytest.raises((ValueError, UnicodeDecodeError)):
        _parse_output(raw)


def test_process_control_bounds_output_without_docker():
    code, raw, issue = _bounded_process([sys.executable, "-c", "import sys;sys.stdout.write('x'*1000000)"], b"{}", 5)
    assert issue == "output-limit"
    assert len(raw) <= OUTPUT_LIMIT


def test_process_control_stops_timeout_without_docker():
    code, raw, issue = _bounded_process([sys.executable, "-c", "import time;time.sleep(30)"], b"{}", 1)
    assert issue == "timeout"
    assert code != 0


def test_process_control_streams_stdin_without_docker():
    payload = b"x" * 300_000
    code, raw, issue = _bounded_process([sys.executable, "-c", "import sys;print(len(sys.stdin.buffer.read()))"], payload, 5)
    assert (code, raw, issue) == (0, b"300000\n", None)


def test_json_comparison_preserves_types_and_declared_float_tolerance():
    assert not _values_equal(True, 1)
    assert not _values_equal({"x": False}, {"x": 0})
    assert _values_equal({"x": [0.1 + 0.2]}, {"x": [0.3]})
    assert not _values_equal([1, 2], [2, 1])
    assert not _values_equal(1000.1, 1000.2)
    assert not _values_equal(1, 2)


def _task():
    from avalon_lab.replay_contract import parse_replay_task
    return parse_replay_task({
        "format": "avalon.replay.v1", "id": "addition", "family_id": "arithmetic",
        "title": "Repair addition", "description": "Return the sum and preserve the configuration.",
        "provenance": {"source": "synthetic", "model": "authored", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"}, "entrypoint": {"file": "solution.py", "function": "solve"},
        "snapshots": {
            "initial": {"solution.py": "def solve(a,b): return a-b\n", "config.txt": "protected"},
            "observed": {"solution.py": "def solve(a,b): return a-b\n", "config.txt": "protected"},
            "reference": {"solution.py": "def solve(a,b): return a+b\n", "config.txt": "protected"},
        },
        "tests": [
            {"id": "positive", "split": "development", "args": [2, 3], "kwargs": {}, "expected": 5},
            {"id": "negative", "split": "holdout", "args": [-4, 1], "kwargs": {}, "expected": -3},
        ],
        "protected_paths": ["config.txt"], "controls": [
            {"id": "positive", "expect": "pass", "files": {"solution.py": "def solve(a,b): return a+b\n", "config.txt": "protected"}},
            {"id": "negative", "expect": "fail", "files": {"solution.py": "def solve(a,b): return 0\n", "config.txt": "protected"}},
        ],
    })


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Set AVALON_REPLAY_DOCKER=1 for real Docker execution.")
def test_real_docker_accepts_alternative_and_rejects_observed_failure():
    task = _task()
    observed = run_snapshot(task, task.snapshots.observed, "python:3.11.15-slim")
    alternative = {**task.snapshots.reference, "solution.py": "def solve(a,b): return sum((a,b))\n"}
    result = run_snapshot(task, alternative, "python:3.11.15-slim")
    assert observed["status"] == "fail"
    assert result["status"] == "pass"
    assert result["image_id"].startswith("sha256:")
    assert len(result["test_results"]) == 2
    assert result["candidate_hash"] != observed["candidate_hash"]


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Set AVALON_REPLAY_DOCKER=1 for real Docker execution.")
def test_real_docker_protected_snapshot_and_development_selection():
    task = _task()
    changed = {**task.snapshots.reference, "config.txt": "changed"}
    assert run_snapshot(task, changed, "python:3.11.15-slim")["status"] == "fail"
    result = run_snapshot(task, task.snapshots.reference, "python:3.11.15-slim", split="development")
    assert result["status"] == "pass"
    assert [row["id"] for row in result["test_results"]] == ["positive"]


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Set AVALON_REPLAY_DOCKER=1 for real Docker execution.")
def test_real_docker_crash_and_timeout_remain_inconclusive():
    task = _task()
    for code, reason in [("def solve(a,b): raise RuntimeError('failure')\n", "process-exit"),
                         ("def solve(a,b):\n while True: pass\n", "timeout")]:
        result = run_snapshot(task, {**task.snapshots.reference, "solution.py": code}, "python:3.11.15-slim",
                              timeout_seconds=2, split="development")
        assert result["status"] == "inconclusive"
        assert result["test_results"][0]["reason"] == reason


def test_container_payload_excludes_expected_values_and_other_tests(monkeypatch):
    import hashlib
    import json
    import avalon_lab.replay_runner as runner
    seen = []
    def execute(argv, payload, timeout_seconds):
        seen.append(json.loads(payload))
        result = {"result": 5, "protected": {"config.txt": hashlib.sha256(b"protected").hexdigest()}}
        return 0, json.dumps(result).encode(), None
    monkeypatch.setattr(runner, "_docker_endpoint", lambda: "unix:///tmp/docker.sock")
    monkeypatch.setattr(runner, "_image_id", lambda *args: "sha256:" + "a" * 64)
    monkeypatch.setattr(runner, "_bounded_process", execute)
    monkeypatch.setattr(runner, "_remove_container", lambda *args: True)
    task = _task()
    receipt = run_snapshot(task, task.snapshots.reference, "test-image", split="development")
    assert receipt["status"] == "pass"
    assert len(seen) == 1
    assert set(seen[0]) == {"files", "path", "function", "args", "kwargs", "protected_paths"}
    assert seen[0]["args"] == [2, 3]
    assert receipt["split"] == "development"


def test_snapshot_paths_are_validated_before_docker(monkeypatch):
    import avalon_lab.replay_runner as runner
    monkeypatch.setattr(runner, "_image_id", lambda *args: pytest.fail("Docker must not start for unsafe files."))
    with pytest.raises(ValueError):
        run_snapshot(_task(), {"../escape.py": "bad"}, "test-image")


def test_protected_change_retains_skipped_test_denominator(monkeypatch):
    import avalon_lab.replay_runner as runner
    monkeypatch.setattr(runner, "_docker_endpoint", lambda: "unix:///tmp/docker.sock")
    monkeypatch.setattr(runner, "_image_id", lambda *args: "sha256:" + "a" * 64)
    monkeypatch.setattr(runner, "_bounded_process", lambda *args: pytest.fail("A protected change must skip execution."))
    task = _task()
    report = run_snapshot(task, {**task.snapshots.reference, "config.txt": "changed"}, "test-image")
    assert report["status"] == "fail"
    assert len(report["test_results"]) == 2
    assert all(row["reason"] == "skipped-protected-change" and row["status"] == "inconclusive" for row in report["test_results"])


def test_nonblocking_io_retries_temporary_unavailability(monkeypatch):
    import avalon_lab.replay_runner as runner
    original_write = runner.os.write
    original_read = runner.os.read
    write_calls = 0
    read_calls = 0
    def flaky_write(fd, value):
        nonlocal write_calls
        write_calls += 1
        if write_calls == 1:
            raise BlockingIOError()
        return original_write(fd, value)
    def flaky_read(fd, count):
        nonlocal read_calls
        read_calls += 1
        if read_calls == 1:
            raise BlockingIOError()
        return original_read(fd, count)
    monkeypatch.setattr(runner.os, "write", flaky_write)
    # Popen uses os.read internally, so inject the read failure after process creation.
    original_popen = runner.subprocess.Popen
    def create_process(*args, **kwargs):
        process = original_popen(*args, **kwargs)
        monkeypatch.setattr(runner.os, "read", flaky_read)
        return process
    monkeypatch.setattr(runner.subprocess, "Popen", create_process)
    code, raw, issue = _bounded_process([sys.executable, "-c", "import sys;print(sys.stdin.read())"], b"ready", 5)
    assert (code, raw, issue) == (0, b"ready\n", None)


@pytest.mark.parametrize("endpoint", ["tcp://remote.example:2375", "ssh://remote.example", "unix://relative/socket"])
def test_remote_or_relative_daemon_never_receives_candidate(monkeypatch, endpoint):
    import avalon_lab.replay_runner as runner
    monkeypatch.delenv("DOCKER_CONTEXT", raising=False)
    monkeypatch.setenv("DOCKER_HOST", endpoint)
    monkeypatch.setattr(runner, "_image_id", lambda *args: "sha256:" + "a" * 64)
    monkeypatch.setattr(runner, "_bounded_process", lambda *args: pytest.fail("Private files must not reach a remote daemon."))
    monkeypatch.setattr(runner, "_remove_container", lambda *args: True)
    task = _task()
    with pytest.raises(RuntimeError, match="local Unix"):
        run_snapshot(task, task.snapshots.reference, "test-image")


def test_cleanup_failure_stops_remaining_test_launches(monkeypatch):
    import avalon_lab.replay_runner as runner
    calls = []
    monkeypatch.setenv("DOCKER_HOST", "unix:///tmp/docker.sock")
    monkeypatch.delenv("DOCKER_CONTEXT", raising=False)
    monkeypatch.setattr(runner, "_image_id", lambda *args: "sha256:" + "a" * 64)
    def execute(*args):
        calls.append(args)
        return 1, b"", "timeout"
    monkeypatch.setattr(runner, "_bounded_process", execute)
    monkeypatch.setattr(runner, "_remove_container", lambda *args: False)
    task = _task()
    report = run_snapshot(task, task.snapshots.reference, "test-image")
    assert len(calls) == 1
    assert report["cleanup_blocked"] is True
    assert report["status"] == "inconclusive"
    assert [row["reason"] for row in report["test_results"]] == ["cleanup-unconfirmed", "skipped-cleanup-blocked"]


def test_effective_context_overrides_host_and_rejects_remote_context(monkeypatch):
    from types import SimpleNamespace
    import avalon_lab.replay_runner as runner
    commands = []
    monkeypatch.setenv("DOCKER_CONTEXT", "selected-context")
    monkeypatch.setenv("DOCKER_HOST", "unix:///tmp/ignored.sock")
    def inspect(argv, **kwargs):
        commands.append(argv)
        assert "DOCKER_CONTEXT" not in kwargs["env"] and "DOCKER_HOST" not in kwargs["env"]
        return SimpleNamespace(returncode=0, stdout=b"ssh://remote.example\n")
    monkeypatch.setattr(runner.subprocess, "run", inspect)
    with pytest.raises(RuntimeError, match="local Unix"):
        runner._docker_endpoint()
    assert commands[0][-1] == "selected-context"


def test_current_context_is_resolved_without_environment_override(monkeypatch):
    from types import SimpleNamespace
    import avalon_lab.replay_runner as runner
    monkeypatch.delenv("DOCKER_CONTEXT", raising=False)
    monkeypatch.delenv("DOCKER_HOST", raising=False)
    def inspect(argv, **kwargs):
        assert argv == ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]
        return SimpleNamespace(returncode=0, stdout=b"unix:///tmp/local.sock\n")
    monkeypatch.setattr(runner.subprocess, "run", inspect)
    assert runner._docker_endpoint() == "unix:///tmp/local.sock"


def test_every_daemon_operation_pins_resolved_endpoint(monkeypatch):
    from types import SimpleNamespace
    import avalon_lab.replay_runner as runner
    endpoint = "unix:///tmp/local.sock"
    seen = []
    monkeypatch.setenv("DOCKER_CONTEXT", "changed-after-resolution")
    monkeypatch.setenv("DOCKER_HOST", "tcp://remote.example:2375")
    def execute(argv, **kwargs):
        seen.append(argv)
        assert argv[:3] == ["docker", "--host", endpoint]
        assert "DOCKER_CONTEXT" not in kwargs["env"] and "DOCKER_HOST" not in kwargs["env"]
        return SimpleNamespace(returncode=0, stdout=("sha256:" + "a" * 64).encode(), stderr=b"")
    monkeypatch.setattr(runner.subprocess, "run", execute)
    image_id = runner._image_id("test-image", endpoint)
    assert runner._remove_container("test-container", endpoint)
    argv = runner._docker_argv(image_id=image_id, name="test-container", endpoint=endpoint)
    assert argv[:4] == ["docker", "--host", endpoint, "run"]
    assert len(seen) == 2
