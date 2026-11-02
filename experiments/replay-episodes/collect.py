"""Record compact evidence from real episode campaigns. Run from the repository root."""
import json
from pathlib import Path
import platform
import tempfile

from avalon_lab.replay_cli import main

results = []
with tempfile.TemporaryDirectory(prefix="avalon-episode-evidence-") as temporary:
    root = Path(temporary)
    for name in ("CartPole-v1", "FrozenLake-v1"):
        task = root / name
        output = root / (name + "-report")
        assert main(["demo", "--environment", name, "--output", str(task)]) == 0
        assert main(["validate", "--task", str(task / "task.json")]) == 0
        assert main(["run", "--task", str(task / "task.json"), "--candidate", f"repair={task / 'repair.json'}",
                     "--candidate", f"always-left={task / 'baseline.json'}", "--output", str(output)]) == 4
        report = json.loads((output / "report.json").read_text())
        assert report["grader"]["status"] == "accepted" and not report["cleanup_blocked"]
        policies = [("observed", report["baseline"]), ("reference", report["reference"])]
        policies += [(candidate["id"], candidate["run"]) for candidate in report["candidates"]]
        results.append({"environment": name, "task": report["task"], "image": report["image"],
                        "measurement": report["measurement"], "grader": report["grader"],
                        "policies": [{"name": label, "hash": run["candidate_hash"], "status": run["status"],
                                      "episodes": [{key: row[key] for key in ("id", "seed", "split", "return", "steps", "status", "wall_ms", "environment")}
                                                   for row in run["episodes"]]} for label, run in policies]})
Path("experiments/replay-episodes/results.json").write_text(json.dumps({
    "provenance": "authored-policies-real-simulators", "platform": platform.platform(), "results": results,
    "limits": ["Four fixed seeds per policy; one run per seed. Uncertainty is not estimated.",
               "FrozenLake uses one deterministic map. Its different seeds do not produce different initial conditions.",
               "These checks do not train weights or establish generalization, production performance, or revenue.",
               "Local compute and candidate generation costs are unpriced. Full temporary traces are not retained here."]}, indent=2) + "\n")
