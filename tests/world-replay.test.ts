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
  expect(() => worldHash(new Array<unknown>(1))).toThrow("finite JSON");
});

it("does not resume an episode from a truncated final state", () => {
  const task = worldTasks()[0]!;
  const stopped = replayWorld({ initial: task.initial, actions: task.knownGood, maxSteps: 1 });
  const resumed = replayWorld({ initial: stopped.final, actions: task.knownGood });
  expect(resumed.stop).toBe("truncated");
  expect(resumed.transitions).toHaveLength(0);
  expect(resumed.final).toEqual(stopped.final);
});

it("detects changed receipt summaries and stored state hashes", () => {
  const task = worldTasks()[0]!;
  const expected = replayWorld({ initial: task.initial, actions: task.knownGood });
  for (const actual of [
    { ...expected, final: { ...expected.final, claimedDone: true } },
    { ...expected, stop: "actions-exhausted" as const },
    { ...expected, stateHashes: [] },
  ]) expect(compareReplay({ expected, actual }).matches).toBe(false);
});

it.each([
  { name: "Date", value: new Date("2026-01-01T00:00:00Z") },
  { name: "Map", value: new Map([["paid", 100]]) },
  { name: "Set", value: new Set([100]) },
])("rejects unsupported $name objects with a fixed error", ({ value }) => {
  expect(() => worldHash(value)).toThrowError(new Error("The hash input must contain finite JSON values."));
});

it("rejects cyclic object and array inputs with a fixed error", () => {
  const record: { self?: unknown } = {};
  record.self = record;
  const array: unknown[] = [];
  array.push(array);
  for (const value of [record, array]) {
    expect(() => worldHash(value)).toThrowError(new Error("The hash input must not contain cycles."));
  }
});

it("preserves plain and null-prototype JSON records with canonical ordering and shared children", () => {
  const shared = { value: [true, null, 2] };
  const record = Object.create(null) as Record<string, unknown>;
  record.b = shared;
  record.a = shared;
  expect(worldHash(record)).toBe(worldHash({ a: { value: [true, null, 2] }, b: { value: [true, null, 2] } }));
});
