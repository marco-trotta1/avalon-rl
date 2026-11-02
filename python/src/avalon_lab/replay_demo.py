"""Authored Replay tasks for the local demonstration."""

from .replay_contract import ReplayTask, parse_replay_task


INITIAL = "def total_active(rows):\n    return 0\n"
OBSERVED = "def total_active(rows):\n    return sum(row['cents'] for row in rows)\n"
REFERENCE = "def total_active(rows):\n    return sum(row['cents'] for row in rows if row['active'])\n"
ALTERNATIVE = """def total_active(rows):
    total = 0
    for row in rows:
        if row['active']:
            total += row['cents']
    return total
"""
OVERFIT = "def total_active(rows):\n    return 125\n"
CONFIG = '{"currency":"USD","strict":true}\n'


def files(code: str) -> dict[str, str]:
    return {"solution.py": code, "config.json": CONFIG}


def demo_task() -> ReplayTask:
    return parse_replay_task({
        "format": "avalon.replay.v1",
        "id": "active-invoice-total",
        "family_id": "invoice-filter",
        "title": "Preserve the active invoice filter",
        "description": "Implement total_active(rows). Sum integer cents for active rows only. Preserve config.json.",
        "provenance": {"source": "synthetic", "model": "authored-control", "captured_at": "2026-11-01T00:00:00Z"},
        "rights": {"status": "private"},
        "entrypoint": {"file": "solution.py", "function": "total_active"},
        "snapshots": {"initial": files(INITIAL), "observed": files(OBSERVED), "reference": files(REFERENCE)},
        "protected_paths": ["config.json"],
        "tests": [
            {"id": "mixed-development", "split": "development", "args": [[
                {"cents": 125, "active": True}, {"cents": 75, "active": False}
            ]], "kwargs": {}, "expected": 125},
            {"id": "refund-holdout", "split": "holdout", "args": [[
                {"cents": -30, "active": True}, {"cents": 400, "active": False}, {"cents": 90, "active": True}
            ]], "kwargs": {}, "expected": 60},
            {"id": "empty-holdout", "split": "holdout", "args": [[]], "kwargs": {}, "expected": 0},
        ],
        "controls": [
            {"id": "legitimate-alternative", "expect": "pass", "files": files(ALTERNATIVE)},
            {"id": "missing-filter", "expect": "fail", "files": files(OBSERVED)},
        ],
    })
