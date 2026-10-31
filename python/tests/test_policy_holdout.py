import copy
import json

import pytest

from avalon_lab.policy_holdout import freeze_holdout, load_evaluation, load_training
from avalon_lab.policy_learning import train_policy
from test_policy_mdp import mdp_value


def frozen_paths(tmp_path):
    paths = []
    for name, seed, family, split in (("train", 7, "invoice-settlement", "train"), ("same", 1007, "invoice-settlement", "eval"), ("family", 2007, "ticket-resolution", "eval")):
        value = mdp_value()
        value.update(seed=seed, family=family, split=split)
        path = tmp_path / f"{name}.json"
        path.write_text(json.dumps(value))
        paths.append(path)
    return {"train_paths": (paths[0],), "same_family_paths": (paths[1],), "family_paths": (paths[2],)}


def test_manifest_freezes_complete_instances_and_delays_evaluation_loading(tmp_path):
    manifest = freeze_holdout(**frozen_paths(tmp_path))
    train, = load_training(manifest)
    run = train_policy(train, seed=7, interactions=100)
    same, = load_evaluation(manifest, policy=run.policy, partition="same-family")
    family, = load_evaluation(manifest, policy=run.policy, partition="family")
    assert train.split == "train"
    assert same.split == family.split == "eval"
    assert same.family == train.family != family.family
    assert {same.seed, family.seed}.isdisjoint({train.seed})
    assert {item.table_hash for item in run.updates} == {train.artifact_hash}
    assert manifest.to_dict()["mutation_family_holdout"] is None


@pytest.mark.parametrize("fault", ["same-seed", "same-family", "reused-file", "role"])
def test_manifest_rejects_seed_family_and_role_leaks(tmp_path, fault):
    paths = frozen_paths(tmp_path)
    target = paths["family_paths" if fault == "same-family" else "same_family_paths"][0]
    value = json.loads(target.read_text())
    if fault == "same-seed":
        value["seed"] = 7
    elif fault == "same-family":
        value["family"] = "invoice-settlement"
    elif fault == "role":
        value["split"] = "train"
    else:
        paths["same_family_paths"] = paths["train_paths"]
    target.write_text(json.dumps(value))
    with pytest.raises(ValueError):
        freeze_holdout(**paths)


def test_manifest_detects_post_freeze_changes_before_scoring(tmp_path):
    paths = frozen_paths(tmp_path)
    manifest = freeze_holdout(**paths)
    train, = load_training(manifest)
    run = train_policy(train, seed=7, interactions=10)
    path = paths["family_paths"][0]
    value = json.loads(path.read_text())
    value["seed"] = 2008
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError, match="after the manifest freeze"):
        load_evaluation(manifest, policy=run.policy, partition="family")
