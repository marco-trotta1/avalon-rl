"""Freeze task-family and generator-seed partitions before policy scoring."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .policy_learning import Policy
from .policy_mdp import Mdp, digest, parse_mdp, read_mdp_document

type Partition = Literal["train", "same-family", "family"]


@dataclass(frozen=True)
class Artifact:
    path: Path
    partition: Partition
    hash: str
    seed: int
    family: str
    task_id: str
    horizon: int
    split: str

    def to_dict(self) -> dict[str, object]:
        return {"file": self.path.name, "partition": self.partition, "hash": self.hash, "seed": self.seed, "family": self.family, "task_id": self.task_id, "horizon": self.horizon, "split": self.split}


@dataclass(frozen=True)
class HoldoutManifest:
    artifacts: tuple[Artifact, ...]
    hash: str

    def partition(self, role: Partition) -> tuple[Artifact, ...]:
        return tuple(item for item in self.artifacts if item.partition == role)

    def to_dict(self) -> dict[str, object]:
        return {"format": "avalon.policy-holdout/v1", "artifacts": [item.to_dict() for item in self.artifacts], "hash": self.hash, "mutation_family_holdout": None}


def freeze_holdout(*, train_paths: tuple[Path, ...], same_family_paths: tuple[Path, ...], family_paths: tuple[Path, ...]) -> HoldoutManifest:
    artifacts = []
    paths = []
    for role, group in (("train", train_paths), ("same-family", same_family_paths), ("family", family_paths)):
        if not 1 <= len(group) <= 128:
            raise ValueError("Use 1 to 128 artifacts in each experiment partition.")
        for path in group:
            value = read_mdp_document(path)
            if not isinstance(value, dict) or value.get("format") != "avalon.mdp/v1" or not isinstance(value.get("task"), dict):
                raise ValueError("Use an MDP document for each frozen artifact.")
            seed, horizon, family, split, task = value.get("seed"), value.get("horizon"), value.get("family"), value.get("split"), value["task"].get("id")
            if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF or type(horizon) is not int or not 1 <= horizon <= 6 or not isinstance(family, str) or not isinstance(task, str):
                raise ValueError("Use complete bounded experiment identity fields.")
            if split != ("train" if role == "train" else "eval"):
                raise ValueError("The envelope split must match its experiment partition.")
            paths.append(path.resolve())
            artifacts.append(Artifact(path, role, digest(value), seed, family, task, horizon, split))
    if len(paths) != len(set(paths)):
        raise ValueError("Do not reuse a file across experiment partitions.")
    identities = [(item.family, item.task_id, item.seed) for item in artifacts]
    if len(identities) != len(set(identities)):
        raise ValueError("Do not reuse a task and generator seed across partitions.")
    train = [item for item in artifacts if item.partition == "train"]
    train_families = {item.family for item in train}
    train_seeds = {item.seed for item in train}
    same_family = [item for item in artifacts if item.partition == "same-family"]
    family = [item for item in artifacts if item.partition == "family"]
    if any(item.family not in train_families or item.seed in train_seeds for item in same_family):
        raise ValueError("Same-family evaluation requires new generator seeds in a training family.")
    if any(item.family in train_families or item.seed in train_seeds for item in family):
        raise ValueError("Family evaluation requires a held-out family and new generator seeds.")
    return HoldoutManifest(tuple(artifacts), digest([item.to_dict() for item in artifacts]))


def _load_frozen(artifact: Artifact) -> Mdp:
    value = read_mdp_document(artifact.path)
    if digest(value) != artifact.hash:
        raise ValueError("The experiment artifact changes after the manifest freeze.")
    return parse_mdp(value)


def load_training(manifest: HoldoutManifest) -> tuple[Mdp, ...]:
    return tuple(_load_frozen(item) for item in manifest.partition("train"))


def load_evaluation(manifest: HoldoutManifest, *, policy: Policy, partition: Literal["same-family", "family"]) -> tuple[Mdp, ...]:
    if not isinstance(policy, Policy) or not policy.hash:
        raise ValueError("Freeze a learned policy before evaluation tables load.")
    if partition not in ("same-family", "family"):
        raise ValueError("Select a documented evaluation partition.")
    return tuple(_load_frozen(item) for item in manifest.partition(partition))
