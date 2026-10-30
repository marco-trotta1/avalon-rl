import gymnasium as gym
import pytest

from avalon_lab.gym_recorder import record_builtin
from avalon_lab.snapshot import encode


@pytest.mark.parametrize("environment_id", ["CartPole-v1", "FrozenLake-v1", "Pendulum-v1"])
def test_real_builtin_recording_is_seeded_and_bounded(environment_id):
    first = record_builtin(environment_id=environment_id, seed=7, episodes=2, max_steps=5)
    second = record_builtin(environment_id=environment_id, seed=7, episodes=2, max_steps=5)
    assert encode(first) == encode(second)
    for episode in first.episodes:
        assert 1 <= len(episode.steps) <= 5
        assert episode.steps[-1].terminated or episode.steps[-1].truncated
        for before, after in zip(episode.steps, episode.steps[1:]):
            assert before.next_observation == after.observation


def test_untrusted_environment_identifier_is_rejected_before_creation(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("The recorder must not call gym.make.")
    monkeypatch.setattr(gym, "make", forbidden)
    with pytest.raises(ValueError, match="built-in"):
        record_builtin(environment_id="untrusted.module:Environment-v0", seed=7)


def test_modified_builtin_registration_is_rejected(monkeypatch):
    spec = gym.spec("CartPole-v1")
    monkeypatch.setattr(spec, "entry_point", "untrusted.module:Environment")
    with pytest.raises(ValueError, match="trusted"):
        record_builtin(environment_id="CartPole-v1", seed=7)


def test_transition_budget_fails_before_environment_creation():
    with pytest.raises(ValueError, match="20,000"):
        record_builtin(environment_id="CartPole-v1", seed=7, episodes=201, max_steps=100)
