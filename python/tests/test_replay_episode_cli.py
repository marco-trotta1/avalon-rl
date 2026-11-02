"""Check episode CLI dispatch and private artifacts without Docker execution."""
import json
from pathlib import Path

import pytest

from avalon_lab.replay_cli import main, read_json
from avalon_lab.replay_episode_contract import episode_task_hash, parse_episode_task


@pytest.mark.parametrize("environment", ["CartPole-v1", "FrozenLake-v1"])
def test_episode_demo_writes_private_valid_task_and_candidates(tmp_path: Path, environment: str, capsys):
    output = tmp_path / "demo"
    assert main(["demo", "--environment", environment, "--output", str(output)]) == 0
    task = parse_episode_task(read_json(output / "task.json"))
    assert task.environment.id == environment
    assert (output.stat().st_mode & 0o777) == 0o700
    for name in ("task.json", "repair.json", "baseline.json"):
        assert ((output / name).stat().st_mode & 0o777) == 0o600
    assert read_json(output / "repair.json") == dict(task.snapshots.reference)
    assert read_json(output / "baseline.json") == dict(task.snapshots.observed)
    capsys.readouterr()
    assert main(["validate", "--task", str(output / "task.json")]) == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["task_hash"] == episode_task_hash(task)
    assert receipt["status"] == "valid"


def test_episode_demo_preserves_existing_directory(tmp_path: Path):
    output = tmp_path / "demo"
    output.mkdir()
    marker = output / "keep.txt"
    marker.write_text("keep")
    with pytest.raises(SystemExit) as error:
        main(["demo", "--environment", "FrozenLake-v1", "--output", str(output)])
    assert error.value.code == 1
    assert marker.read_text() == "keep"
    assert not (output / "task.json").exists()


@pytest.mark.parametrize("status,exit_code", [("accepted", 0), ("rejected", 4), ("inconclusive", 5)])
def test_run_dispatches_episode_campaign_and_preserves_outcome(tmp_path: Path, monkeypatch, status: str, exit_code: int):
    output = tmp_path / "demo"
    assert main(["demo", "--environment", "FrozenLake-v1", "--output", str(output)]) == 0
    calls = []
    def campaign(**kwargs):
        calls.append(kwargs)
        return {"format": "avalon.replay-episode-campaign.v1", "status": status}
    monkeypatch.setattr("avalon_lab.replay_episodes.run_episode_campaign", campaign)
    monkeypatch.setattr("avalon_lab.replay_episodes.render_episode_html", lambda report: "<p>" + report["status"] + "</p>")
    result = tmp_path / "result"
    assert main(["run", "--task", str(output / "task.json"), "--candidate", f"repair={output / 'repair.json'}",
                 "--output", str(result)]) == exit_code
    assert len(calls) == 1
    assert calls[0]["task"].environment.id == "FrozenLake-v1"
    assert calls[0]["candidates"]["repair"] == read_json(output / "repair.json")
    assert read_json(result / "report.json")["status"] == status
    assert (result / "report.html").read_text() == "<p>" + status + "</p>"


def test_episode_validation_rejects_reused_holdout_seed(tmp_path: Path):
    output = tmp_path / "demo"
    main(["demo", "--environment", "CartPole-v1", "--output", str(output)])
    task = read_json(output / "task.json")
    task["episodes"][-1]["seed"] = task["episodes"][0]["seed"]
    (output / "task.json").write_text(json.dumps(task))
    with pytest.raises(SystemExit) as error:
        main(["validate", "--task", str(output / "task.json")])
    assert error.value.code == 1


def test_campaign_executes_non_gym_trusted_world_with_mock_policy():
    from avalon_lab.replay_adapters import Transition
    from avalon_lab.replay_episode_contract import episode_task_to_dict
    from avalon_lab.replay_episode_demo import episode_demo
    from avalon_lab.replay_episodes import run_episode_campaign

    good = {"policy.py": "def act(observation):\n    return 1\n"}
    bad = {"policy.py": "def act(observation):\n    return 0\n"}
    data = episode_task_to_dict(episode_demo())
    data["environment"] = {"adapter": "trusted-test-world", "id": "CountToThree-v1", "kwargs": {}}
    data["snapshots"] = {"initial": bad, "observed": bad, "reference": good}
    data["controls"] = [{"id": "reach-goal", "expect": "pass", "files": good},
                        {"id": "stay-put", "expect": "fail", "files": bad}]
    data["max_steps"] = 3
    data["min_return"] = 1
    task = parse_episode_task(data)
    worlds = []
    actors = []

    class CountingWorld:
        def __init__(self, *, max_steps):
            self.max_steps = max_steps
            self.closed = False
            self.steps = 0
            self.position = 0

        def reset(self, *, seed):
            self.position = 0
            self.steps = 0
            return {"position": self.position}

        def step(self, action):
            if type(action) is not int or action not in (0, 1):
                raise ValueError("Use zero or one.")
            self.steps += 1
            self.position += action
            reached = self.position == 3
            return Transition({"position": self.position}, 1.0 if reached else 0.0,
                              reached, self.steps >= self.max_steps and not reached)

        def metadata(self):
            return {"adapter": "trusted-test-world", "version": "1", "reward_authority": "trusted-host-world"}

        def close(self):
            self.closed = True

    def adapter_factory(spec, *, max_steps):
        assert spec.adapter == "trusted-test-world"
        world = CountingWorld(max_steps=max_steps)
        worlds.append(world)
        return world

    class MockActor:
        def __init__(self, **kwargs):
            self.action = 1 if "return 1" in kwargs["files"]["policy.py"] else 0
            self.image_id = "mock-image"
            self.candidate_hash = "c" * 64
            self.closed = False
            actors.append(self)

        def start(self):
            return None

        def act(self, observation):
            assert set(observation) == {"position"}
            return self.action

        def close(self):
            self.closed = True
            return {"cleanup_blocked": False, "container_name": None}

    report = run_episode_campaign(task=task, candidates={"repair": good}, image="mock-image",
                                  adapter_factory=adapter_factory, actor_factory=MockActor)
    assert report["status"] == "accepted"
    assert report["candidates"][0]["status"] == "accepted"
    assert worlds and all(world.closed for world in worlds)
    assert all(world.steps == 3 for world in worlds)
    assert actors and all(actor.closed for actor in actors)
