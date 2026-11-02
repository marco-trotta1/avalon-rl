"""World protocol tests use fake sessions unless Docker is explicitly enabled."""

import os

import pytest

from avalon_lab.replay_actor import ActorError
from avalon_lab.replay_contract import Entrypoint
from avalon_lab.replay_project_contract import WorldSpec
from avalon_lab.replay_script_world import ScriptWorldAdapter, WorldCleanupError


class FakeSession:
    def __init__(self, **options):
        self.options = options
        self.image_id = "sha256:" + "a" * 64
        self.candidate_hash = "b" * 64
        self.requests = []
        self.response = {"observation": {"position": 0}}
        self.receipt = {"cleanup_blocked": False, "container_name": None}
        self.start_error = None
        self.act_error = None
        self.closed = 0

    def start(self):
        if self.start_error:
            raise self.start_error

    def act(self, request):
        self.requests.append(request)
        if self.act_error:
            raise self.act_error
        return self.response

    def close(self):
        self.closed += 1
        return self.receipt


@pytest.fixture
def world():
    return WorldSpec(files={"world.py": "These bytes never execute on the host."}, entrypoint=Entrypoint("world.py", "act"))


@pytest.fixture
def factory(monkeypatch):
    import avalon_lab.replay_script_world as module
    created = []
    def create(**options):
        session = FakeSession(**options)
        created.append(session)
        return session
    monkeypatch.setattr(module, "DockerPolicySession", create)
    return created


def test_reset_and_step_keep_world_state_in_a_separate_session(world, factory):
    adapter = ScriptWorldAdapter(world, image="image", max_steps=2)
    session = factory[0]
    assert session.options["files"] == world.files
    assert session.options["max_actions"] == 3
    assert session.options["episode_timeout_seconds"] == 60
    assert adapter.reset(seed=19) == {"position": 0}
    session.response = {"observation": {"position": 1}, "reward": 2, "terminated": False, "truncated": False}
    transition = adapter.step({"move": 1})
    assert transition.reward == pytest.approx(2.0)
    assert not transition.terminated and not transition.truncated
    assert session.requests == [{"op": "reset", "seed": 19}, {"op": "step", "action": {"move": 1}}]
    assert adapter.metadata()["reward_authority"] == "isolated-world-process"
    assert adapter.metadata()["image_id"] == session.image_id
    assert len(adapter.metadata()["world_hash"]) == 64
    adapter.close()
    adapter.close()
    assert session.closed == 1


def test_step_limit_truncates_and_requires_a_new_episode(world, factory):
    adapter = ScriptWorldAdapter(world, image="image", max_steps=1)
    adapter.reset(seed=7)
    factory[0].response = {"observation": 1, "reward": 0.0, "terminated": False, "truncated": False}
    assert adapter.step(0).truncated
    with pytest.raises(RuntimeError):
        adapter.step(0)
    with pytest.raises(RuntimeError):
        adapter.reset(seed=8)
    adapter.close()


@pytest.mark.parametrize("response", [
    {"observation": 0, "reward": True, "terminated": False, "truncated": False},
    {"observation": 0, "reward": float("nan"), "terminated": False, "truncated": False},
    {"observation": 0, "reward": float("inf"), "terminated": False, "truncated": False},
    {"observation": 0, "reward": 1, "terminated": 1, "truncated": False},
    {"observation": 0, "reward": 1, "terminated": False, "truncated": "false"},
    {"observation": 0, "reward": 1, "terminated": False},
    {"observation": 0, "reward": 1, "terminated": False, "truncated": False, "extra": True},
])
def test_invalid_world_results_close_the_session(world, factory, response):
    adapter = ScriptWorldAdapter(world, image="image", max_steps=2)
    adapter.reset(seed=7)
    factory[0].response = response
    with pytest.raises(ActorError):
        adapter.step(0)
    assert factory[0].closed == 1


def test_reset_rejects_extra_fields_and_invalid_seeds(world, factory):
    adapter = ScriptWorldAdapter(world, image="image", max_steps=2)
    for seed in (True, -1, 2**32):
        with pytest.raises(ValueError):
            adapter.reset(seed=seed)
    factory[0].response = {"observation": 0, "expected_reward": 1}
    with pytest.raises(ActorError, match="world-protocol"):
        adapter.reset(seed=7)
    assert factory[0].closed == 1


def test_constructor_cleanup_failure_retains_the_container_name(world, monkeypatch):
    import avalon_lab.replay_script_world as module
    session = FakeSession()
    session.start_error = ActorError("startup")
    session.receipt = {"cleanup_blocked": True, "container_name": "unremoved-world"}
    monkeypatch.setattr(module, "DockerPolicySession", lambda **options: session)
    with pytest.raises(WorldCleanupError) as failure:
        ScriptWorldAdapter(world, image="image", max_steps=2)
    assert failure.value.container_name == "unremoved-world"
    assert failure.value.receipt == session.receipt


def test_request_cleanup_failure_takes_precedence_over_timeout(world, factory):
    adapter = ScriptWorldAdapter(world, image="image", max_steps=2)
    session = factory[0]
    session.act_error = ActorError("timeout")
    session.receipt = {"cleanup_blocked": True, "container_name": "unremoved-world"}
    with pytest.raises(WorldCleanupError) as failure:
        adapter.reset(seed=7)
    assert failure.value.cleanup_blocked
    assert failure.value.container_name == "unremoved-world"
    with pytest.raises(WorldCleanupError):
        adapter.close()
    assert session.closed == 1


def test_world_hash_changes_with_source_or_entrypoint(world, factory):
    first = ScriptWorldAdapter(world, image="image", max_steps=2)
    changed = ScriptWorldAdapter(WorldSpec({"world.py": "Changed source"}, world.entrypoint), image="image", max_steps=2)
    assert first.metadata()["world_hash"] != changed.metadata()["world_hash"]
    first.close()
    changed.close()


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker world tests explicitly.")
def test_real_docker_world_runs_multistep_allocation():
    from avalon_lab.replay_project_demo import project_demo
    adapter = ScriptWorldAdapter(project_demo().world, image="python:3.11.15-slim", max_steps=2)
    try:
        assert adapter.reset(seed=7)["target"] == 1
        first = adapter.step(1)
        second = adapter.step(0)
        assert first.reward == pytest.approx(1.0) and not first.terminated
        assert second.reward == pytest.approx(1.0) and second.terminated
        assert adapter.metadata()["image_id"].startswith("sha256:")
    finally:
        adapter.close()


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker world tests explicitly.")
def test_real_docker_world_loads_assets_and_accepts_structured_actions():
    code = '''from pathlib import Path
position=0
goal=int(Path("goal.txt").read_text())
def act(request):
 global position
 if request["op"]=="reset":
  position=0
  return {"observation":{"position":position}}
 position+=request["action"]["delta"]
 return {"observation":{"position":position},"reward":int(position==goal),"terminated":position>=goal,"truncated":False}
'''
    world = WorldSpec({"world.py": code, "goal.txt": "3"}, Entrypoint("world.py", "act"))
    adapter = ScriptWorldAdapter(world, image="python:3.11.15-slim", max_steps=3)
    try:
        assert adapter.reset(seed=1) == {"position": 0}
        assert adapter.step({"delta": 2}).reward == pytest.approx(0.0)
        final = adapter.step({"delta": 1})
        assert final.terminated and final.observation == {"position": 3}
    finally:
        adapter.close()


@pytest.mark.skipif(os.environ.get("AVALON_REPLAY_DOCKER") != "1", reason="Enable real Docker world tests explicitly.")
def test_real_docker_world_invalid_protocol_is_not_a_valid_reward():
    code = '''def act(request):
 if request["op"]=="reset": return {"observation":0}
 return {"observation":0,"reward":True,"terminated":True,"truncated":False}
'''
    adapter = ScriptWorldAdapter(WorldSpec({"world.py": code}, Entrypoint("world.py", "act")),
                                 image="python:3.11.15-slim", max_steps=1)
    try:
        adapter.reset(seed=1)
        with pytest.raises(ActorError, match="world-protocol"):
            adapter.step(0)
    finally:
        adapter.close()
