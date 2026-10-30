"""Execute and record a local preservation experiment."""

import hashlib
from importlib.metadata import version
import os
from pathlib import Path
import platform
from time import perf_counter

from .faults import FAULTS, inject_fault
from .learner import learner_snapshot, train_counter
from .minari_bridge import collect_counter
from .snapshot import write_json, write_snapshot


def run_experiment(*, output: Path, seed: int) -> dict:
    if not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("Use a uint32 seed.")
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    latencies = {}
    previous_mask = os.umask(0o077)
    try:
        started = perf_counter()
        source, recorded, _ = collect_counter(root=output / "minari", seed=seed)
        latencies["collect_save_load_ms"] = (perf_counter() - started) * 1000
        started = perf_counter()
        learner = learner_snapshot(recorded)
        table = train_counter(learner)
        latencies["convert_train_ms"] = (perf_counter() - started) * 1000
        snapshots = {"source.json": source, "recorded.json": recorded, "learner.json": learner}
        snapshots.update({f"fault-{fault}.json": inject_fault(recorded, fault=fault) for fault in FAULTS})
        for name, snapshot in snapshots.items():
            write_snapshot(output / name, snapshot)
        write_json(output / "learner-table.json", {"algorithm": "tabular_td", "epochs": 10, "discount": 0.99, "learning_rate": 0.1, "table": table})
        hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(output.glob("*.json"))}
        manifest = {
            "format": "avalon.python-experiment/v1", "evidence": "synthetic", "seed": seed,
            "versions": {"python": platform.python_version(), **{name: version(name) for name in ("avalon-rl-lab", "gymnasium", "minari", "numpy", "h5py", "pillow", "jax", "jaxlib", "scipy", "ml_dtypes")}},
            "episodes": len(source.episodes), "transitions": sum(len(episode.steps) for episode in source.episodes),
            "sha256": hashes, "latency": {"unit": "ms", "samples": 1, "uncertainty": "not estimated", "measurements": latencies},
            "api_calls": 0, "api_cost_usd": 0, "local_compute_cost": "not measured",
            "injected_faults": list(FAULTS), "upstream_defects": [],
            "limits": ["Synthetic counter only.", "No policy quality evaluation.", "Minari environment recovery metadata is absent."],
        }
        write_json(output / "manifest.json", manifest)
        return manifest
    finally:
        os.umask(previous_mask)
