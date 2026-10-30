import { expect, it } from "vitest";
import { parseSnapshotText } from "../src/lab/contract.js";
import { replayWorld } from "../src/world/replay.js";
import { makeWorldSnapshot, worldEpisodeSnapshot } from "../src/world/snapshot.js";
import { worldTasks } from "../src/world/tasks.js";

it("exports all challenge episodes through the shared snapshot boundary", () => {
  const snapshot = makeWorldSnapshot();
  expect(snapshot.evidence).toBe("synthetic");
  expect(snapshot.episodes).toHaveLength(20);
  expect(parseSnapshotText(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(new Set(snapshot.episodes.map(episode => episode.id)).size).toBe(20);
  for (const episode of snapshot.episodes) {
    for (let index = 1; index < episode.steps.length; index++) {
      expect(episode.steps[index]?.observation).toEqual(episode.steps[index - 1]?.next_observation);
    }
  }
  expect(snapshot.episodes.some(episode => episode.metadata?.weak_accepted === true && episode.metadata?.oracle_accepted === false)).toBe(true);
});

it("preserves final observations and both ending flags", () => {
  const task = worldTasks()[0]!;
  const receipt = replayWorld({ initial: task.initial, actions: task.knownGood, maxSteps: 2 });
  const episode = worldEpisodeSnapshot({ id: "both-signals", task, receipt });
  expect(episode.steps.at(-1)?.next_observation).toEqual(receipt.final);
  expect(episode.steps.at(-1)).toMatchObject({ terminated: true, truncated: true, bootstrap_mask: 0 });
  const truncated = makeWorldSnapshot({ maxSteps: 1 }).episodes[0]!;
  expect(truncated.steps[0]).toMatchObject({ terminated: false, truncated: true, bootstrap_mask: 1 });
});

it("preserves rewarded failure without treating finish as success", () => {
  const failed = makeWorldSnapshot().episodes.find(episode => episode.id === "settle-a-claim-only")!;
  expect(failed.steps.at(-1)).toMatchObject({ reward: 1, terminated: true, truncated: false });
  expect(failed.metadata?.oracle_accepted).toBe(false);
});
