import { expect, it } from "vitest";
import { compareReplay, replayWorld, worldHash } from "../src/world/replay.js";
import { worldTasks } from "../src/world/tasks.js";

it("reproduces every transition hash for the catalog", () => {
  for (const task of worldTasks()) {
    const options = { initial: task.initial, actions: task.knownGood };
    const receipt = replayWorld(options);
    expect(compareReplay({ expected: receipt, actual: replayWorld(options) }).matches).toBe(true);
    expect(receipt.stateHashes).toHaveLength(task.knownGood.length);
  }
  expect(worldHash({ b: 2, a: 1 })).toBe(worldHash({ a: 1, b: 2 }));
});

it("locates changed transitions and initial state divergence", () => {
  const task = worldTasks()[0]!;
  const expected = replayWorld({ initial: task.initial, actions: task.knownGood });
  const actual = replayWorld({ initial: task.initial, actions: [{ type: "claim-done" }, { type: "finish" }] });
  expect(compareReplay({ expected, actual })).toMatchObject({ matches: false, firstIndex: 0 });
  const changedSeed = worldTasks({ seed: 8 })[0]!;
  const different = replayWorld({ initial: changedSeed.initial, actions: changedSeed.knownGood });
  expect(compareReplay({ expected, actual: different }).firstIndex).toBe(-1);
});

it("bounds replay and retains simultaneous ending flags", () => {
  const task = worldTasks()[0]!;
  const receipt = replayWorld({ initial: task.initial, actions: task.knownGood, maxSteps: 2 });
  const ordinary = replayWorld({ initial: task.initial, actions: task.knownGood });
  expect(compareReplay({ expected: ordinary, actual: receipt })).toMatchObject({ matches: false, firstIndex: 1 });
  expect(receipt.stop).toBe("truncated");
  expect(receipt.transitions[1]).toMatchObject({ terminated: true, truncated: true });
  expect(() => worldHash({ value: undefined })).toThrow("finite JSON");
});

it("does not resume an episode from a truncated final state", () => {
  const task = worldTasks()[0]!;
  const stopped = replayWorld({ initial: task.initial, actions: task.knownGood, maxSteps: 1 });
  const resumed = replayWorld({ initial: stopped.final, actions: task.knownGood });
  expect(resumed.stop).toBe("truncated");
  expect(resumed.transitions).toHaveLength(0);
  expect(resumed.final).toEqual(stopped.final);
});
