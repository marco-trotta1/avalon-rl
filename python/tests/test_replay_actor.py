"""Authored transport tests and separately enabled real Docker actor tests."""

import os
import sys

import pytest

from avalon_lab.replay_actor import ACTOR_HARNESS, ActorError, DockerPolicySession, _actor_argv

READY = '''
import json, sys
initial = json.loads(sys.stdin.readline())
print(json.dumps({"id": initial["id"], "ready": True}), flush=True)
'''
ECHO = READY + '''
for line in sys.stdin:
    request = json.loads(line)
    print(json.dumps({"id": request["id"], "action": request["observation"]}), flush=True)
'''


def _session(monkeypatch, worker=ECHO, **options):
    import avalon_lab.replay_actor as actor
    monkeypatch.setattr(actor, "_docker_endpoint", lambda: "unix:///tmp/test-docker.sock")
    monkeypatch.setattr(actor, "_image_id", lambda image, endpoint: "sha256:" + "a" * 64)
    monkeypatch.setattr(actor, "_actor_argv", lambda **kwargs: [sys.executable, "-u", "-c", worker])
    monkeypatch.setattr(actor, "_remove_container", lambda name, endpoint: True)
    return DockerPolicySession(files={"policy.py": "Policy bytes are not executed by these transport tests."},
                               entrypoint_file="policy.py", function="act", image="fixture", **options)


def test_actor_uses_existing_container_controls_and_static_harness():
    argv = _actor_argv(image_id="sha256:" + "a" * 64, name="actor-test", endpoint="unix:///tmp/local.sock")
    assert argv[:4] == ["docker", "--host", "unix:///tmp/local.sock", "run"]
    assert argv[-1] == ACTOR_HARNESS
    for flag, value in (("--network", "none"), ("--memory", "128m"), ("--pids-limit", "32"), ("--user", "65534:65534")):
        assert argv[argv.index(flag) + 1] == value
    assert "--read-only" in argv and "--mount" not in argv and "-v" not in argv


def test_authored_transport_reuses_process_and_closes_idempotently(monkeypatch):
    session = _session(monkeypatch)
    session.start()
    try:
        assert session.act([1, 2, 3]) == [1, 2, 3]
        assert session.act(2) == 2
        assert session.image_id == "sha256:" + "a" * 64
        assert len(session.candidate_hash) == 64
    finally:
        result = session.close()
    assert result["actions"] == 2
    assert result["cleanup_blocked"] is False
    assert result == session.close()
    with pytest.raises(ActorError, match="state"):
        session.act(0)


def test_actor_transmits_only_policy_bootstrap_and_observation_requests(monkeypatch):
    worker = READY + '''
for line in sys.stdin:
    request = json.loads(line)
    action = {"startup_keys": sorted(initial), "request_keys": sorted(request)}
    print(json.dumps({"id": request["id"], "action": action}), flush=True)
'''
    with _session(monkeypatch, worker) as session:
        result = session.act([0, 1])
    assert result == {"startup_keys": ["entrypoint_file", "files", "function", "id"], "request_keys": ["id", "observation"]}


@pytest.mark.parametrize("response", [
    'json.dumps({"id": "stale", "action": 0})',
    '"{bad json}"',
    '"{\\\"id\\\":\\\"x\\\",\\\"id\\\":\\\"y\\\",\\\"action\\\":0}"',
    'json.dumps({"id": request["id"], "action": float("nan")})',
    'json.dumps({"id": request["id"], "action": 0, "reward": 999})',
])
def test_protocol_failures_stop_session_without_exposing_output(monkeypatch, response):
    worker = READY + '\nrequest = json.loads(sys.stdin.readline())\nprint(' + response + ', flush=True)\n'
    session = _session(monkeypatch, worker)
    session.start()
    with pytest.raises(ActorError) as failure:
        session.act(0)
    assert failure.value.reason == "protocol"
    assert session.close()["cleanup_blocked"] is False
    assert "bad json" not in str(failure.value)


def test_action_timeout_stops_authored_process(monkeypatch):
    session = _session(monkeypatch, READY + "\nimport time;time.sleep(30)\n", timeout_seconds=1)
    session.start()
    with pytest.raises(ActorError, match="timeout"):
        session.act(0)
    assert session.close()["cleanup_blocked"] is False


def test_stdout_line_limit_stops_authored_process(monkeypatch):
    worker = READY + '\nsys.stdin.readline()\nsys.stdout.write("x" * 100000);sys.stdout.flush()\n'
    session = _session(monkeypatch, worker)
    session.start()
    with pytest.raises(ActorError, match="output-limit"):
        session.act(0)


def test_stderr_cumulative_limit_stops_authored_process(monkeypatch):
    import avalon_lab.replay_actor as actor
    monkeypatch.setattr(actor, "MAX_SESSION_OUTPUT_BYTES", 200)
    worker = READY + '\nsys.stdin.readline()\nsys.stderr.write("x" * 1000);sys.stderr.flush()\n'
    session = _session(monkeypatch, worker)
    session.start()
    with pytest.raises(ActorError, match="output-limit"):
        session.act(0)


def test_action_budget_prevents_another_request(monkeypatch):
    session = _session(monkeypatch, max_actions=1)
    session.start()
    assert session.act(0) == 0
    with pytest.raises(ActorError, match="action-limit"):
        session.act(1)
    assert session.close()["actions"] == 1


def test_cleanup_failure_is_retained_and_blocks_session_reuse(monkeypatch):
    import avalon_lab.replay_actor as actor
    session = _session(monkeypatch)
    calls = []
    def unavailable(name, endpoint):
        calls.append((name, endpoint))
        return False
    monkeypatch.setattr(actor, "_remove_container", unavailable)
    session.start()
    receipt = session.close()
    assert len(calls) == 2
    assert receipt["cleanup_blocked"] is True
    assert receipt["container_name"].startswith("avalon-actor-")
    assert receipt == session.close()
    with pytest.raises(ActorError, match="state"):
        session.start()


def test_invalid_policy_and_observations_never_continue(monkeypatch):
    with pytest.raises(ValueError):
        DockerPolicySession(files={"../policy.py": "x"}, entrypoint_file="../policy.py", function="act", image="fixture")
    session = _session(monkeypatch)
    session.start()
    with pytest.raises(ActorError, match="protocol"):
        session.act(float("inf"))
    assert session.close()["actions"] == 0


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker actor tests explicitly.")
def test_real_docker_actor_persists_state_within_episode_and_resets_between_episodes():
    policy = "count=0\ndef act(observation):\n global count\n count+=1\n return count\n"
    for _ in range(2):
        with DockerPolicySession(files={"policy.py": policy}, entrypoint_file="policy.py", function="act",
                                 image="python:3.11.15-slim") as session:
            assert session.act([0, 0, 0, 0]) == 1
            assert session.act([1, 0, 0, 0]) == 2
        assert session.close()["cleanup_blocked"] is False


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker actor tests explicitly.")
def test_real_docker_actor_supports_scalar_and_continuous_actions():
    policy = "def act(observation):\n return [float(observation[0])] if isinstance(observation,list) else 1\n"
    with DockerPolicySession(files={"policy.py": policy}, entrypoint_file="policy.py", function="act",
                             image="python:3.11.15-slim") as session:
        assert session.act(2) == 1
        assert session.act([0.5, 0.0, 0.0]) == [0.5]


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker actor tests explicitly.")
def test_real_docker_actor_timeout_closes_container():
    policy = "def act(observation):\n while True: pass\n"
    session = DockerPolicySession(files={"policy.py": policy}, entrypoint_file="policy.py", function="act",
                                  image="python:3.11.15-slim", timeout_seconds=2)
    session.start()
    with pytest.raises(ActorError, match="timeout"):
        session.act(0)
    assert session.close()["cleanup_blocked"] is False


def test_total_episode_deadline_prevents_another_action(monkeypatch):
    import time
    session = _session(monkeypatch)
    session.start()
    session._started_at = time.monotonic() - 61
    with pytest.raises(ActorError, match="episode-timeout"):
        session.act(0)
    assert session.close()["actions"] == 0


def test_total_episode_deadline_caps_a_pending_action(monkeypatch):
    session = _session(monkeypatch, READY + "\nimport time;time.sleep(30)\n", timeout_seconds=5)
    session.start()
    session.episode_timeout_seconds = 0.05
    with pytest.raises(ActorError, match="episode-timeout"):
        session.act(0)
    assert session.close()["cleanup_blocked"] is False


@pytest.mark.parametrize("budget", [0, 301, True, 1.5])
def test_episode_timeout_validates_before_start(monkeypatch, budget):
    with pytest.raises(ValueError, match="episode timeout"):
        _session(monkeypatch, episode_timeout_seconds=budget)


def test_cleanup_retries_until_removal_is_confirmed(monkeypatch):
    import avalon_lab.replay_actor as actor
    session = _session(monkeypatch)
    responses = iter([False, True])
    calls = []
    def remove(name, endpoint):
        calls.append((name, endpoint))
        return next(responses)
    monkeypatch.setattr(actor, "_remove_container", remove)
    session.start()
    receipt = session.close()
    assert receipt["cleanup_blocked"] is False
    assert len(calls) == 2
    assert calls[0] == calls[1]
