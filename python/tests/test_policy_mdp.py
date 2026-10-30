import copy
import json
from pathlib import Path

import pytest

from avalon_lab.policy_mdp import parse_mdp, read_mdp

FIXTURE = Path(__file__).resolve().parents[2] / "examples/policy/tiny-mdp.json"


def mdp_value():
    return json.loads(FIXTURE.read_text())


def test_real_boundary_preserves_horizon_history_and_excludes_hidden_labels():
    table = read_mdp(FIXTURE)
    assert len(table.states) == 9
    assert table.states["s0"].remaining == 2
    assert table.known_good == ("pay-a", "finish")
    assert "settle-a" not in table.states["s0"].key
    assert table.artifact_hash == parse_mdp(mdp_value()).artifact_hash
    assert isinstance(table.states["s0"].transitions[0].rewards, tuple)


@pytest.mark.parametrize("fault", ["history", "horizon", "coverage", "ending", "unreachable", "feature", "duplicate"])
def test_table_rejects_broken_boundary_invariants(fault):
    value = mdp_value()
    state = value["states"][1]
    if fault == "history":
        state["history"]["prohibitedActions"] = 1
    elif fault == "horizon":
        state["remaining"] = 2
    elif fault == "coverage":
        state["transitions"].pop()
    elif fault == "ending":
        value["states"][0]["transitions"][0]["truncated"] = True
    elif fault == "unreachable":
        extra = copy.deepcopy(value["states"][-1])
        extra["id"] = "unreachable"
        value["states"].append(extra)
    elif fault == "feature":
        state["observationKey"] = json.dumps({"expectedVerdict": True})
    else:
        value["states"].append(copy.deepcopy(state))
    with pytest.raises(ValueError):
        parse_mdp(value)


def test_read_rejects_duplicate_fields_and_regular_file_overflow(tmp_path, monkeypatch):
    path = tmp_path / "duplicate.json"
    path.write_text('{"format":"x","format":"y"}')
    with pytest.raises(ValueError, match="repeat"):
        read_mdp(path)
    import avalon_lab.policy_mdp as boundary
    monkeypatch.setattr(boundary, "MAX_MDP_BYTES", 8)
    path.write_text(" " * 9)
    with pytest.raises(ValueError, match="64 MiB"):
        read_mdp(path)


def test_read_rejects_unwritten_pipe_without_blocking(tmp_path):
    import os
    pipe = tmp_path / "pipe"
    os.mkfifo(pipe)
    with pytest.raises(ValueError, match="regular"):
        read_mdp(pipe)


def test_initial_observation_must_match_the_declared_initial_records():
    from avalon_lab.policy_mdp import _observation, _task, feature_key
    value = mdp_value()
    initial = value["states"][0]
    initial["observation"]["invoices"][0]["paid"] = 100
    initial["observationKey"] = feature_key(_observation(initial["observation"]), _task(value["task"]))
    with pytest.raises(ValueError, match="initial records"):
        parse_mdp(value)
