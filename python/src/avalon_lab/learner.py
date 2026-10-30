"""Explicit NumPy learner conversion with termination-only masks."""

from dataclasses import replace

import numpy as np

from .snapshot import Snapshot, reward_value


def learner_snapshot(recorded: Snapshot) -> Snapshot:
    if recorded.stage != "recorded":
        raise ValueError("Use a recorded snapshot for the learner adapter.")
    episodes = []
    for episode in recorded.episodes:
        rewards = np.asarray([reward_value(step.reward, path=f"episode[{episode.id}].rewards[{index}]") for index, step in enumerate(episode.steps)], dtype=np.float64)
        terminations = np.asarray([step.terminated for step in episode.steps], dtype=np.bool_)
        truncations = np.asarray([step.truncated for step in episode.steps], dtype=np.bool_)
        masks = np.logical_not(terminations).astype(np.uint8)
        steps = tuple(replace(
            step, reward=float(rewards[index]),
            terminated=bool(terminations[index]), truncated=bool(truncations[index]),
            bootstrap_mask=int(masks[index]),
        ) for index, step in enumerate(episode.steps))
        episodes.append(replace(episode, steps=steps))
    return replace(recorded, stage="learner", producer={"name": "avalon-numpy-learner", "version": np.__version__}, episodes=tuple(episodes))


def train_counter(snapshot: Snapshot, *, learning_rate: float = 0.1, discount: float = 0.99, epochs: int = 10) -> np.ndarray:
    """Run tabular TD updates on the synthetic discrete counter."""
    if snapshot.stage != "learner":
        raise ValueError("Use a learner snapshot for training.")
    if not 0 < learning_rate <= 1 or not 0 <= discount <= 1 or not 1 <= epochs <= 1000:
        raise ValueError("Use valid training parameters.")
    steps = [step for episode in snapshot.episodes for step in episode.steps]
    for step in steps:
        values = (step.observation, step.next_observation, step.action)
        if not all(type(value) is int and 0 <= value <= 100 for value in values):
            raise ValueError("Use bounded scalar counter states and actions.")
        if step.bootstrap_mask != int(not step.terminated):
            raise ValueError("Use the termination-only bootstrap mask.")
    if not steps:
        raise ValueError("Use at least one training transition.")
    state_count = max(max(step.observation, step.next_observation) for step in steps) + 1
    action_count = max(step.action for step in steps) + 1
    table = np.ones((state_count, action_count), dtype=np.float64)
    for _ in range(epochs):
        for step in steps:
            target = step.reward + discount * step.bootstrap_mask * np.max(table[step.next_observation])
            table[step.observation, step.action] += learning_rate * (target - table[step.observation, step.action])
    return table
