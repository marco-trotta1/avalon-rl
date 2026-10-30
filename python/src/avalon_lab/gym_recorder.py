"""Bounded recording from an allowlist of built-in Gymnasium environments."""

import gymnasium as gym

from .snapshot import Episode, MAX_STEPS, Snapshot, Step, json_value, reward_value

BUILTIN_ENVIRONMENTS = {
    "CartPole-v1": "gymnasium.envs.classic_control.cartpole:CartPoleEnv",
    "FrozenLake-v1": "gymnasium.envs.toy_text.frozen_lake:FrozenLakeEnv",
    "Taxi-v3": "gymnasium.envs.toy_text.taxi:TaxiEnv",
    "Pendulum-v1": "gymnasium.envs.classic_control.pendulum:PendulumEnv",
    "MountainCar-v0": "gymnasium.envs.classic_control.mountain_car:MountainCarEnv",
}


def record_builtin(*, environment_id: str, seed: int, episodes: int = 2, max_steps: int = 100) -> Snapshot:
    if environment_id not in BUILTIN_ENVIRONMENTS:
        raise ValueError("Select a supported built-in Gymnasium environment.")
    if not 0 <= seed <= 0xFFFFFFFF or not 1 <= episodes <= MAX_STEPS or not 1 <= max_steps <= MAX_STEPS or episodes * max_steps > MAX_STEPS:
        raise ValueError("Use a uint32 seed and at most 20,000 transitions.")
    spec = gym.spec(environment_id)
    if spec.entry_point != BUILTIN_ENVIRONMENTS[environment_id] or spec.additional_wrappers:
        raise ValueError("The environment registration differs from the trusted built-in registration.")
    environment = gym.make(environment_id, max_episode_steps=max_steps)
    captured = []
    try:
        for episode_index in range(episodes):
            episode_seed = (seed + episode_index) % (2**32)
            observation, reset_info = environment.reset(seed=episode_seed)
            environment.action_space.seed(episode_seed)
            steps = []
            for index in range(max_steps):
                before = json_value(observation, path=f"episode[{episode_index}].observation")
                action = environment.action_space.sample()
                next_observation, reward, terminated, truncated, _ = environment.step(action)
                steps.append(Step(index, before, json_value(action), reward_value(reward, path=f"episode[{environment_id}-{episode_index}].rewards[{index}]"), json_value(next_observation), bool(terminated), bool(truncated)))
                observation = next_observation
                if terminated or truncated:
                    break
            captured.append(Episode(f"{environment_id}-{episode_index}", environment_id, tuple(steps), {"task_family": environment_id.split("-v")[0], "reset_info": json_value(reset_info)}))
    finally:
        environment.close()
    return Snapshot("source", {"name": "gymnasium", "version": gym.__version__}, seed, "synthetic", tuple(captured))
