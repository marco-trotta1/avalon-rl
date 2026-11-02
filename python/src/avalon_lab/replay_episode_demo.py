"""Authored policies for a grid game and a simulated control problem."""

from .replay_episode_contract import EpisodeTask, parse_episode_task

BAD_POLICY = "def act(observation):\n    return 0\n"
CARTPOLE_POLICY = "def act(observation):\n    return int(observation[2] + 0.25 * observation[3] > 0)\n"
FROZENLAKE_POLICY = "def act(observation):\n    return {0: 2, 1: 2, 2: 1, 6: 1, 10: 1, 14: 2}.get(observation, 0)\n"


def episode_demo(environment: str = "CartPole-v1") -> EpisodeTask:
    if environment not in ("CartPole-v1", "FrozenLake-v1"):
        raise ValueError("Select CartPole-v1 or FrozenLake-v1 for the episode demonstration.")
    game = environment == "FrozenLake-v1"
    good = FROZENLAKE_POLICY if game else CARTPOLE_POLICY
    return parse_episode_task({
        "format": "avalon.replay-episode.v1", "id": "frozenlake-route" if game else "cartpole-balance",
        "title": "Reach the grid goal" if game else "Keep the pole upright",
        "description": "Return one action from act(observation). The trusted world computes each reward.",
        "provenance": {"source": "synthetic", "model": "authored-policy", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"},
        "environment": {"adapter": "gymnasium", "id": environment, "kwargs": {"is_slippery": False} if game else {}},
        "policy": {"file": "policy.py", "function": "act"},
        "snapshots": {"initial": {"policy.py": BAD_POLICY}, "observed": {"policy.py": BAD_POLICY},
                      "reference": {"policy.py": good}},
        "controls": [{"id": "reference-controller", "expect": "pass", "files": {"policy.py": good}},
                     {"id": "always-left", "expect": "fail", "files": {"policy.py": BAD_POLICY}}],
        "episodes": [{"id": f"{split}-{seed}", "split": split, "seed": seed}
                     for split, seeds in (("development", (7, 19)), ("holdout", (41, 53))) for seed in seeds],
        "max_steps": 20 if game else 100, "min_return": 1 if game else 80,
    })
