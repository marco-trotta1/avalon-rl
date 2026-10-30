"""Execute seeded tabular Q-learning on validated inert transitions."""

from dataclasses import dataclass
import math
import random
from typing import NewType

from .policy_mdp import ARMS, Count, Mdp, RewardArm, Seed, State, digest

Probability = NewType("Probability", float)
QValue = NewType("QValue", float)


@dataclass(frozen=True)
class Policy:
    weights: tuple[tuple[str, tuple[tuple[str, QValue], ...]], ...]
    hash: str

    def values(self, state: State) -> dict[str, QValue]:
        return dict(dict(self.weights).get(state.key, ()))


@dataclass(frozen=True)
class Update:
    ordinal: Count
    table_hash: str
    state_id: str
    action: str
    previous: QValue
    target: QValue
    updated: QValue
    terminated: bool
    truncated: bool


@dataclass(frozen=True)
class TrainingConfig:
    seed: Seed
    interactions: Count
    arm: RewardArm
    learning_rate: Probability
    discount: Probability
    epsilon: Probability


@dataclass(frozen=True)
class TrainingRun:
    policy: Policy
    updates: tuple[Update, ...]
    config: TrainingConfig
    table_hashes: tuple[str, ...]
    changed_updates: Count


def training_config(*, seed: int, interactions: int, arm: RewardArm, learning_rate: float = 0.3, discount: float = 0.95, epsilon: float = 0.2) -> TrainingConfig:
    if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF or type(interactions) is not int or not 1 <= interactions <= 100_000:
        raise ValueError("Use a uint32 seed and 1 to 100,000 interactions.")
    if arm not in ARMS:
        raise ValueError("Use a documented reward arm.")
    for value in (learning_rate, discount, epsilon):
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError("Use finite learning probabilities from zero through one.")
    if learning_rate <= 0:
        raise ValueError("Use a positive learning rate.")
    return TrainingConfig(Seed(seed), Count(interactions), arm, Probability(float(learning_rate)), Probability(float(discount)), Probability(float(epsilon)))


def freeze_policy(weights: dict[str, dict[str, QValue]]) -> Policy:
    frozen = tuple((key, tuple(sorted(values.items()))) for key, values in sorted(weights.items()))
    return Policy(frozen, digest({"algorithm": "tabular-q-learning", "feature_version": "1", "weights": frozen}))


def greedy_action(*, state: State, values: dict[str, QValue], rng: random.Random) -> str:
    available = sorted(edge.action for edge in state.transitions)
    if not available:
        raise ValueError("Select an action only in an active state.")
    maximum = max(values.get(action, QValue(0.0)) for action in available)
    # The tolerance groups float64 rounding ties without changing the reward scale.
    tied = [action for action in available if math.isclose(values.get(action, QValue(0.0)), maximum, rel_tol=0, abs_tol=1e-12)]
    return rng.choice(tied)


def train_policy(table: Mdp, *, seed: int, interactions: int, arm: RewardArm = "history", learning_rate: float = 0.3, discount: float = 0.95, epsilon: float = 0.2) -> TrainingRun:
    config = training_config(seed=seed, interactions=interactions, arm=arm, learning_rate=learning_rate, discount=discount, epsilon=epsilon)
    if table.split != "train":
        raise ValueError("Train on a training table only.")
    rng = random.Random(config.seed)
    weights: dict[str, dict[str, QValue]] = {}
    updates = []
    state = table.states[table.initial_state]
    changed = 0
    for ordinal in range(config.interactions):
        values = weights.setdefault(state.key, {})
        action = rng.choice(sorted(edge.action for edge in state.transitions)) if rng.random() < config.epsilon else greedy_action(state=state, values=values, rng=rng)
        edge = next(edge for edge in state.transitions if edge.action == action)
        target_state = table.states[edge.next_state]
        target_values = weights.get(target_state.key, {})
        future = 0.0 if edge.terminated else max((target_values.get(item.action, QValue(0.0)) for item in target_state.transitions), default=0.0)
        target = QValue(edge.reward(config.arm) + config.discount * future)
        previous = values.get(action, QValue(0.0))
        updated = QValue(previous + config.learning_rate * (target - previous))
        values[action] = updated
        changed += int(abs(updated - previous) > 1e-12)
        updates.append(Update(Count(ordinal), table.artifact_hash, state.id, action, previous, target, updated, edge.terminated, edge.truncated))
        state = table.states[table.initial_state] if edge.terminated or edge.truncated else target_state
    return TrainingRun(freeze_policy(weights), tuple(updates), config, (table.artifact_hash,), Count(changed))
