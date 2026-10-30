import { describe, expect, it } from "vitest";
import { parseSnapshot, parseSnapshotText } from "../src/lab/contract.js";

const input = {
  format: "avalon.snapshot/v1", stage: "source", evidence: "synthetic", seed: 7,
  producer: { name: "test-world", version: "1" },
  episodes: [{ id: "e1", task: "counter", steps: [{
    index: 0, observation: { counter: 0 }, action: "increment", reward: 1,
    next_observation: { counter: 1 }, terminated: true, truncated: false,
  }] }],
};

describe("snapshot boundary", () => {
  it("preserves JSON values and independent ending signals", () => {
    for (const flags of [[true, false], [false, true], [true, true], [false, false]]) {
      const data = structuredClone(input);
      const step = data.episodes[0]?.steps[0];
      if (!step) throw new Error("The fixture requires a step.");
      step.terminated = flags[0] ?? false;
      step.truncated = flags[1] ?? false;
      expect(parseSnapshotText(JSON.stringify(data))).toEqual(data);
    }
  });

  it.each([
    { ...input, format: "future" },
    { ...input, seed: -1 },
    { ...input, episodes: [] },
    { ...input, unexpected: "secret" },
    { ...input, producer: { name: "test", version: "" } },
  ])("rejects unsupported input at the boundary", value => {
    expect(() => parseSnapshot(value)).toThrow("documented");
  });

  it("does not copy a rejected payload into its errors", () => {
    expect(() => parseSnapshotText('{"secret":"private"')).toThrow("valid JSON");
    expect(() => parseSnapshot({ secret: "private" })).toThrow(/^Use the documented Avalon snapshot format\.$/);
  });
  it("rejects a JSON property that the schema parser cannot preserve", () => {
    const data = JSON.parse(JSON.stringify(input)) as typeof input;
    data.episodes[0]!.steps[0]!.observation = JSON.parse('{"__proto__":{"counter":1}}') as { counter: number };
    expect(() => parseSnapshotText(JSON.stringify(data))).toThrow("unsupported JSON property");
  });
});
