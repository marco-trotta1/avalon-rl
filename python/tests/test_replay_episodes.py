"""Policy evaluation tests use fake actors and a deterministic test world."""

from dataclasses import replace

import pytest

from avalon_lab.replay_actor import ActorError
from avalon_lab.replay_adapters import Transition
from avalon_lab.replay_episode_contract import parse_episode_task
from avalon_lab.replay_episodes import render_episode_html, run_episode_campaign


@pytest.fixture
def task():
    bad, good = {"policy.py": "bad"}, {"policy.py": "good"}
    return parse_episode_task({
        "format": "avalon.replay-episode.v1", "id": "test-world", "title": "Test world", "description": "Fake actor unit tests.",
        "provenance": {"source": "synthetic", "model": "fake-actor", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"}, "environment": {"adapter": "test", "id": "Test-v1", "kwargs": {}},
        "policy": {"file": "policy.py", "function": "act"}, "snapshots": {"initial": bad, "observed": bad, "reference": good},
        "controls": [{"id": "positive", "expect": "pass", "files": good}, {"id": "negative", "expect": "fail", "files": bad}],
        "episodes": [{"id": "dev", "split": "development", "seed": 7}, {"id": "held", "split": "holdout", "seed": 19}],
        "max_steps": 2, "min_return": 2.0,
    })


class TestWorld:
    __test__ = False

    def __init__(self, spec, *, max_steps):
        self.steps = 0
        self.seed = None

    def reset(self, *, seed):
        self.seed = seed
        return {"seed": seed, "step": 0}

    def step(self, action):
        if type(action) is not int or action not in (0, 1):
            raise ValueError("Invalid test action.")
        self.steps += 1
        return Transition({"seed": self.seed, "step": self.steps}, float(action), self.steps == 2, False)

    def close(self):
        pass

    def metadata(self):
        return {"adapter": "test", "source_sha256": "a" * 64, "evidence": "unit-test-world"}


class FakeActor:
    def __init__(self, **options):
        self.mode = options["files"]["policy.py"]
        self.image_id = "sha256:" + "b" * 64

    def start(self):
        pass

    def act(self, observation):
        if self.mode == "timeout":
            raise ActorError("timeout")
        if self.mode == "forge":
            return {"action": 1, "reward": 100000}
        if self.mode == "overfit":
            return int(observation["seed"] == 7)
        return int(self.mode == "good")

    def close(self):
        return {"cleanup_blocked": False, "container_name": None, "evidence": "fake-actor"}


def run(task, candidates=None, **options):
    return run_episode_campaign(task, candidates or {"repair": {"policy.py": "good"}}, "test-image",
                                adapter_factory=options.pop("adapter_factory", TestWorld),
                                actor_factory=options.pop("actor_factory", FakeActor), **options)


def test_host_rewards_and_paired_seeds_decide_repairs(task):
    report = run(task)
    assert report["status"] == "accepted"
    assert report["grader"]["status"] == "accepted"
    assert [row["return"] for row in report["baseline"]["episodes"]] == [0.0, 0.0]
    candidate = report["candidates"][0]
    assert [row["seed"] for row in candidate["run"]["episodes"]] == [7, 19]
    assert candidate["development"]["passed"] == candidate["holdout"]["passed"] == 1
    episode = candidate["run"]["episodes"][0]
    assert episode["return"] == pytest.approx(2.0)
    assert episode["terminated"] and not episode["truncated"]
    assert [step["reward"] for step in episode["transitions"]] == [1.0, 1.0]
    assert episode["transitions"][0]["next_observation"] == episode["transitions"][1]["observation"]
    assert episode["environment"]["source_sha256"] == "a" * 64
    assert report["measurement"]["compute_cost_usd"] is None


@pytest.mark.parametrize("mode", ["forge", "timeout"])
def test_invalid_actions_and_timeouts_cannot_satisfy_negative_controls(task, mode):
    task = replace(task, controls=(task.controls[0], replace(task.controls[1], files={"policy.py": mode})))
    report = run(task)
    assert report["status"] == "inconclusive"
    assert report["grader"]["status"] == "inconclusive"
    assert report["controls"][1]["run"]["status"] == "inconclusive"
    assert all(row["return"] is None for row in report["controls"][1]["run"]["episodes"])


def test_holdout_failure_rejects_development_only_repair(task):
    report = run(task, {"overfit": {"policy.py": "overfit"}})
    assert report["status"] == "rejected"
    candidate = report["candidates"][0]
    assert candidate["development"]["passed"] == 1
    assert candidate["holdout"]["failed"] == 1


def test_step_budget_is_valid_truncation_not_timeout(task):
    class EndlessWorld(TestWorld):
        def step(self, action):
            transition = super().step(action)
            return replace(transition, terminated=False)

    report = run(task, adapter_factory=EndlessWorld)
    assert report["status"] == "accepted"
    episode = report["candidates"][0]["run"]["episodes"][0]
    assert episode["truncated"] and not episode["terminated"]
    assert episode["ending_source"] == "campaign-step-limit"


def test_cleanup_failure_stops_all_later_actor_and_world_creation(task):
    created = []

    class CleanupFailure(FakeActor):
        def __init__(self, **options):
            super().__init__(**options)
            created.append(self)

        def close(self):
            return {"cleanup_blocked": True, "container_name": "outstanding-test-container"}

    report = run(task, actor_factory=CleanupFailure)
    assert len(created) == 1
    assert report["status"] == "inconclusive"
    assert report["cleanup_blocked"]
    assert report["outstanding_containers"] == ["outstanding-test-container"]
    assert report["baseline"]["episodes"][1]["reason"] == "prior-cleanup-unconfirmed"
    assert report["candidates"][0]["holdout"]["total"] == 1
    assert report["candidates"][0]["holdout"]["inconclusive"] == 1


def test_trace_budget_does_not_create_a_completed_result(task):
    class LargeWorld(TestWorld):
        def step(self, action):
            transition = super().step(action)
            return replace(transition, observation="x" * 1_048_576)

    report = run(task, adapter_factory=LargeWorld)
    assert report["status"] == "inconclusive"
    assert report["baseline"]["episodes"][0]["reason"] == "trace-limit"
    assert not report["baseline"]["episodes"][0]["transitions"]


def test_html_escapes_labels_and_contains_host_trace_evidence(task):
    attack = "<script>alert(1)</script>"
    report = run(replace(task, title=attack), {attack: {"policy.py": "good"}})
    html = render_episode_html(report)
    assert attack not in html
    assert "&lt;script&gt;" in html
    assert "unit-test-world" in html
    assert "https://" not in html


def test_close_runs_after_host_rejects_a_forged_reward(task):
    closed = []

    class TrackingActor(FakeActor):
        def close(self):
            closed.append(self.mode)
            return super().close()

    report = run(task, {"forged": {"policy.py": "forge"}}, actor_factory=TrackingActor)
    assert report["candidates"][0]["status"] == "inconclusive"
    assert closed.count("forge") == 2


def test_world_cleanup_failure_stops_later_execution(task):
    created = []

    class UnclosedWorld(TestWorld):
        def __init__(self, spec, *, max_steps):
            super().__init__(spec, max_steps=max_steps)
            created.append(self)

        def close(self):
            raise RuntimeError("World cleanup fails.")

    report = run(task, adapter_factory=UnclosedWorld)
    assert len(created) == 1
    assert report["cleanup_blocked"]
    assert report["status"] == "inconclusive"


def test_trace_preserves_actions_before_the_world_mutates_them(task):
    class MappingActor(FakeActor):
        def act(self, observation):
            result = {"choice": super().act(observation)}
            observation["seed"] = 999
            return result

    class MutatingWorld(TestWorld):
        def step(self, action):
            value = action["choice"]
            action["choice"] = -1
            return super().step(value)

    report = run(task, actor_factory=MappingActor, adapter_factory=MutatingWorld)
    first = report["candidates"][0]["run"]["episodes"][0]["transitions"][0]
    assert first["action"] == {"choice": 1}
    assert first["observation"]["seed"] == 7


def test_custom_factories_do_not_claim_zero_external_costs(task):
    report = run(task)
    assert report["measurement"]["model_api_calls"] is None
    assert report["measurement"]["model_api_cost_usd"] is None
    assert report["execution"]["actor"] == "trusted-custom"
