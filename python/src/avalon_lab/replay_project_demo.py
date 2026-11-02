"""An authored allocation workflow that demonstrates a frozen project."""
from .replay_project_contract import Project, parse_project

BAD_POLICY = "def act(observation):\n    return 0\n"
GOOD_POLICY = "def act(observation):\n    return observation['target']\n"
WORLD_CODE = '''state = None

def act(request):
    global state
    if request["op"] == "reset":
        seed = request["seed"]
        state = {"step": 0, "first_target": seed % 2}
        return {"observation": {"target": state["first_target"], "remaining_steps": 2}}
    if request["op"] != "step" or state is None or state["step"] >= 2:
        raise ValueError("Reset the world before taking an action.")
    action = request["action"]
    if type(action) is not int or action not in (0, 1):
        raise ValueError("Allocate the resource to target zero or one.")
    target = (state["first_target"] + state["step"]) % 2
    reward = 1 if action == target else 0
    state["step"] += 1
    return {"observation": {"target": (state["first_target"] + state["step"]) % 2,
                            "remaining_steps": 2 - state["step"]},
            "reward": reward, "terminated": state["step"] == 2, "truncated": False}
'''


def project_demo() -> Project:
    bad = {"policy.py": BAD_POLICY}
    good = {"policy.py": GOOD_POLICY}
    return parse_project({
        "format": "avalon.replay-project.v1",
        "brief": "Allocate one resource to the requested target in each of two steps. Preserve the original failure and evaluate a repair.",
        "assumptions": ["The world is an authored two-target simulation.",
                        "The observation reveals the requested target without noise.",
                        "Each correct allocation receives one reward unit."],
        "split_rationale": "Development and holdout use distinct declared seeds. The world has only two possible target orders, which repeat across splits. No independent scenario, group, or time separation exists. This demonstrates workflow replay, not generalization or leakage-free evaluation.",
        "context": {"scenario.txt": "Authored context: two targets request a shared resource in alternating order. No external files or customer data are included.\n"},
        "world": {"files": {"world.py": WORLD_CODE}, "entrypoint": {"file": "world.py", "function": "act"}},
        "task": {
            "format": "avalon.replay-episode.v1", "id": "resource-allocation-demo",
            "title": "Allocate a resource to the requested target",
            "description": "Return target zero or one from act(observation). Allocate to observation['target'] at each step.",
            "provenance": {"source": "synthetic", "model": "authored-policy", "captured_at": "2026-11-01T00:00:00Z"},
            "rights": {"status": "private"},
            "environment": {"adapter": "python-world", "id": "ResourceAllocation-v1", "kwargs": {}},
            "policy": {"file": "policy.py", "function": "act"},
            "snapshots": {"initial": bad, "observed": bad, "reference": good},
            "controls": [{"id": "follow-request", "expect": "pass", "files": good},
                         {"id": "always-zero", "expect": "fail", "files": bad}],
            "episodes": [{"id": "development-7", "split": "development", "seed": 7},
                         {"id": "development-8", "split": "development", "seed": 8},
                         {"id": "holdout-19", "split": "holdout", "seed": 19},
                         {"id": "holdout-20", "split": "holdout", "seed": 20}],
            "max_steps": 2, "min_return": 2,
        },
    })
