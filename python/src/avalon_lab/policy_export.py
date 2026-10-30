"""Export actual policy inputs and world evidence as separate inert snapshots."""

from dataclasses import asdict, replace
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Literal

from .policy_evaluation import Evaluation
from .policy_mdp import Mdp, digest
from .snapshot import Episode, Json, Snapshot, Step, encode, write_json, write_snapshot


def _episode_id(*, table_hash: str, evaluation: Evaluation, ordinal: int) -> str:
    identity = {"table_hash": table_hash, "evaluation_seed": evaluation.evaluation_seed, "strategy": evaluation.strategy, "policy_hash": evaluation.policy_hash, "reward_arm": evaluation.arm, "ordinal": ordinal}
    return f"policy-{digest(identity)}"


def policy_snapshot(table: Mdp, *, evaluations: tuple[Evaluation, ...], seed: int, view: Literal["policy", "world"] = "policy") -> Snapshot:
    if view not in ("policy", "world") or not evaluations:
        raise ValueError("Select a documented observation view and completed evaluations.")
    episodes = []
    for ordinal, evaluation in enumerate(evaluations):
        if evaluation.table_hash != table.artifact_hash:
            raise ValueError("Bind the evaluation to its original MDP artifact.")
        current = table.initial_state
        steps = []
        for index, row in enumerate(evaluation.steps):
            if row.state_id != current:
                raise ValueError("Preserve the actual rollout state sequence.")
            state = table.states[current]
            edge = next((edge for edge in state.transitions if edge.action == row.action), None)
            if edge is None or edge.next_state != row.next_state or edge.terminated != row.terminated or edge.truncated != row.truncated or not math.isclose(edge.reward(evaluation.arm), row.reward, rel_tol=0, abs_tol=1e-12):
                raise ValueError("Preserve the actual transition, reward, and ending signals.")
            target = table.states[row.next_state]
            observation = json.loads(state.key) if view == "policy" else state.observation.to_dict()
            next_observation = json.loads(target.key) if view == "policy" else target.observation.to_dict()
            steps.append(Step(index, observation, json.loads(table.actions[row.action]), row.reward, next_observation, row.terminated, row.truncated, int(not row.terminated)))
            current = row.next_state
        if not steps or not (steps[-1].terminated or steps[-1].truncated):
            raise ValueError("Export only completed evaluation episodes.")
        metadata: dict[str, Json] = {"table_hash": table.artifact_hash, "policy_hash": evaluation.policy_hash, "family": table.family, "generator_seed": table.seed, "evaluation_seed": evaluation.evaluation_seed, "strategy": evaluation.strategy, "reward_arm": evaluation.arm, "observation_view": view}
        episode_id = _episode_id(table_hash=table.artifact_hash, evaluation=evaluation, ordinal=ordinal)
        episodes.append(Episode(episode_id, table.task.id, tuple(steps), metadata))
    snapshot = Snapshot("learner" if view == "policy" else "recorded", {"name": "avalon-inert-mdp-rollout", "version": "1"}, seed, "synthetic", tuple(episodes))
    encode(snapshot)
    return snapshot


def write_policy_evidence(*, tables: tuple[Mdp, ...], evaluations: tuple[Evaluation, ...], seed: int, directory: Path, name: str) -> dict[str, str]:
    if not re.fullmatch(r"[a-z0-9-]{1,120}", name):
        raise ValueError("Use a bounded evidence name with lowercase letters, digits, and hyphens.")
    by_hash = {table.artifact_hash: table for table in tables}
    if len(by_hash) != len(tables) or any(item.table_hash not in by_hash for item in evaluations):
        raise ValueError("Supply each original table exactly once.")
    files = []
    for view, suffix in (("policy", "learner"), ("world", "world")):
        parts = []
        for ordinal, item in enumerate(evaluations):
            part = policy_snapshot(by_hash[item.table_hash], evaluations=(item,), seed=seed, view=view)
            episode = replace(part.episodes[0], id=_episode_id(table_hash=item.table_hash, evaluation=item, ordinal=ordinal))
            parts.append(replace(part, episodes=(episode,)))
        if not parts:
            raise ValueError("Use at least one completed evaluation.")
        combined = Snapshot(parts[0].stage, parts[0].producer, seed, "synthetic", tuple(episode for part in parts for episode in part.episodes))
        path = directory / f"{name}-{suffix}.json"
        write_snapshot(path, combined)
        files.append(path)
    outcomes = []
    for ordinal, item in enumerate(evaluations):
        episode_id = _episode_id(table_hash=item.table_hash, evaluation=item, ordinal=ordinal)
        outcomes.append({"episode_id": episode_id, "table_hash": item.table_hash, "policy_hash": item.policy_hash, "task_id": item.task_id, "family": item.family, "generator_seed": item.table_seed, "evaluation_seed": item.evaluation_seed, "independent_outcome": asdict(item.outcome), "recorded_outcome": asdict(item.recorded_outcome), "outcome_matches": item.outcome_matches})
    path = directory / f"{name}-outcomes.json"
    write_json(path, {"format": "avalon.policy-outcomes/v1", "evidence": "synthetic", "episodes": outcomes})
    files.append(path)
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
