"""Controlled synthetic faults with explicit provenance labels."""

from dataclasses import replace
from typing import Literal

from .snapshot import Snapshot

type Fault = Literal["drop-transition", "reward-shift", "reset-observation", "collapsed-flags", "stale-metadata"]
FAULTS: tuple[Fault, ...] = ("drop-transition", "reward-shift", "reset-observation", "collapsed-flags", "stale-metadata")


def inject_fault(snapshot: Snapshot, *, fault: Fault) -> Snapshot:
    if snapshot.evidence != "synthetic":
        raise ValueError("Inject faults into synthetic snapshots only.")
    episodes = list(snapshot.episodes)
    if fault == "collapsed-flags":
        candidates = [index for index, episode in enumerate(episodes) if episode.steps[-1].truncated and not episode.steps[-1].terminated]
        if not candidates:
            raise ValueError("Use an episode with truncation and no termination.")
        episode_index = candidates[0]
    else:
        episode_index = 0
    episode = episodes[episode_index]
    steps = list(episode.steps)
    match fault:
        case "drop-transition":
            if len(steps) < 2:
                raise ValueError("Use an episode with at least two transitions.")
            steps.pop(0)
        case "reward-shift":
            steps[0] = replace(steps[0], reward=steps[0].reward + 1.0)
        case "reset-observation":
            if steps[-1].next_observation == steps[0].observation:
                raise ValueError("Use distinct initial and final observations.")
            steps[-1] = replace(steps[-1], next_observation=steps[0].observation)
        case "collapsed-flags":
            steps[-1] = replace(steps[-1], terminated=True, truncated=False)
        case "stale-metadata":
            metadata = dict(episode.metadata or {})
            metadata["mission"] = "injected_stale_mission"
            episode = replace(episode, metadata=metadata)
        case _:
            raise ValueError("Use a documented controlled fault.")
    episodes[episode_index] = replace(episode, steps=tuple(steps))
    return replace(snapshot, episodes=tuple(episodes), producer={"name": f"avalon-injected-{fault}", "version": "0.1.0"})
