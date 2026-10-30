"""A seeded scalar environment with explicit ending cases."""

import gymnasium as gym
from gymnasium import spaces

from .snapshot import Episode, Snapshot, Step


class CounterEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, *, target: int = 3):
        self.target = target
        self.observation_space = spaces.Discrete(target + 1)
        self.action_space = spaces.Discrete(2)
        self.position = 0

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.position = int(self.np_random.integers(0, 2))
        return self.position, {"mission": "reach_target"}

    def step(self, action):
        if not self.action_space.contains(action):
            raise ValueError("Use action 0 or 1.")
        self.position = min(self.target, self.position + int(action))
        terminated = self.position >= self.target
        return self.position, float(terminated), terminated, False, {"mission": "reach_target"}


def record_counter(*, seed: int, episodes: int = 3, env=None) -> Snapshot:
    if not 1 <= episodes <= 1000 or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("Use 1 to 1,000 episodes and a uint32 seed.")
    environment = env if env is not None else gym.wrappers.TimeLimit(CounterEnv(), max_episode_steps=3)
    captured = []
    try:
        for episode_index in range(episodes):
            observation, info = environment.reset(seed=(seed + episode_index) % (2**32))
            steps = []
            for index in range(3):
                # The middle episode deliberately reaches the external time limit.
                action = 0 if episode_index % 3 == 1 else 1
                next_observation, reward, terminated, truncated, _ = environment.step(action)
                steps.append(Step(index, int(observation), action, float(reward), int(next_observation), bool(terminated), bool(truncated)))
                observation = next_observation
                if terminated or truncated:
                    break
            captured.append(Episode(f"counter-{episode_index}", "counter", tuple(steps), {"mission": info["mission"], "task_family": "counter"}))
    finally:
        if env is None:
            environment.close()
    return Snapshot("source", {"name": "avalon-gymnasium-counter", "version": "0.1.0"}, seed, "synthetic", tuple(captured))
