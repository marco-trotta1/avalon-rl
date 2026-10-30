"""Compare training schedules under one action interaction budget."""

from dataclasses import dataclass
import random
from typing import Literal

from .policy_evaluation import independent_outcome
from .policy_learning import QValue, TrainingRun, freeze_policy, q_update, training_config
from .policy_mdp import Count, Mdp, Reward, RewardArm, TerminalOutcome

type Schedule = Literal["fixed", "random", "disagreement"]


@dataclass(frozen=True)
class TrainingEpisode:
    table_hash: str
    start: Count
    stop: Count
    completed: bool
    actions: tuple[str, ...]
    proxy_return: Reward
    outcome: TerminalOutcome | None
    selection_reason: str
    selection_score: float | None


@dataclass(frozen=True)
class ScheduledRun:
    training: TrainingRun
    schedule: Schedule
    episodes: tuple[TrainingEpisode, ...]


def training_catalog(tables: tuple[Mdp, ...]) -> None:
    if not tables or len(tables) > 128 or any(table.split != "train" for table in tables):
        raise ValueError("Use 1 to 128 training tables only.")
    if len({table.artifact_hash for table in tables}) != len(tables):
        raise ValueError("Use distinct training artifacts.")
    signatures = {}
    for table in tables:
        for state in table.states.values():
            signature = sorted((edge.action, table.states[edge.next_state].key, edge.rewards, edge.terminated, edge.truncated) for edge in state.transitions)
            if state.key in signatures and signatures[state.key] != signature:
                raise ValueError("The training feature map aliases different table rules.")
            signatures[state.key] = signature


@dataclass(frozen=True)
class TrainingScore:
    attempts: Count = Count(0)
    disagreements: Count = Count(0)


def choose_training_index(*, scores: tuple[TrainingScore, ...], schedule: Schedule, episode: int, rng: random.Random) -> tuple[int, str, float | None]:
    if schedule == "fixed":
        return episode % len(scores), "cycle", None
    if schedule == "random":
        return rng.randrange(len(scores)), "uniform", None
    unseen = [index for index, score in enumerate(scores) if score.attempts == 0]
    if unseen:
        return unseen[0], "coverage", None
    rates = [(score.disagreements + 1) / (score.attempts + 2) for score in scores]
    highest = max(rates)
    tied = [index for index, rate in enumerate(rates) if abs(rate - highest) <= 1e-12]
    return rng.choice(tied), "training-disagreement", highest


def train_schedule(tables: tuple[Mdp, ...], *, seed: int, interactions: int, arm: RewardArm = "history", schedule: Schedule = "fixed", learning_rate: float = 0.3, discount: float = 0.95, epsilon: float = 0.2) -> ScheduledRun:
    training_catalog(tables)
    if schedule not in ("fixed", "random", "disagreement"):
        raise ValueError("Use the fixed, random, or disagreement task schedule.")
    config = training_config(seed=seed, interactions=interactions, arm=arm, learning_rate=learning_rate, discount=discount, epsilon=epsilon)
    learner_rng = random.Random(config.seed)
    schedule_rng = random.Random(config.seed ^ 0x9E3779B9)
    weights: dict[str, dict[str, QValue]] = {}
    updates = []
    episodes = []
    scores = [TrainingScore() for _ in tables]
    while len(updates) < config.interactions:
        index, reason, score = choose_training_index(scores=tuple(scores), schedule=schedule, episode=len(episodes), rng=schedule_rng)
        table = tables[index]
        state = table.states[table.initial_state]
        start = len(updates)
        actions = []
        proxy_return = 0.0
        completed = False
        while len(updates) < config.interactions:
            update, target = q_update(table=table, state=state, weights=weights, rng=learner_rng, config=config, ordinal=len(updates))
            updates.append(update)
            actions.append(update.action)
            edge = next(edge for edge in state.transitions if edge.action == update.action)
            proxy_return += edge.reward(arm)
            state = target
            if update.terminated or update.truncated:
                completed = True
                break
        outcome = independent_outcome(table=table, state=state, actions=tuple(actions)) if completed else None
        episodes.append(TrainingEpisode(table.artifact_hash, Count(start), Count(len(updates)), completed, tuple(actions), Reward(proxy_return), outcome, reason, score))
        if outcome is not None:
            previous = scores[index]
            disagrees = (proxy_return > 0) != outcome.valid
            scores[index] = TrainingScore(Count(previous.attempts + 1), Count(previous.disagreements + int(disagrees)))
    changed = Count(sum(abs(item.updated - item.previous) > 1e-12 for item in updates))
    training = TrainingRun(freeze_policy(weights), tuple(updates), config, tuple(table.artifact_hash for table in tables), changed)
    return ScheduledRun(training, schedule, tuple(episodes))
