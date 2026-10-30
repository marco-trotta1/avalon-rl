import { describe, expect, it } from "vitest";
import { auditSnapshots, contentHash } from "../src/audit/engine.js";
import { parseSnapshot, type Snapshot } from "../src/lab/contract.js";

export function fixture(stage: Snapshot["stage"] = "source"): Snapshot {
  return parseSnapshot({
    format: "avalon.snapshot/v1", stage, producer: { name: "fixture", version: "1" }, seed: 7, evidence: "synthetic",
    episodes: [{ id: "private-episode", task: "counter", steps: [{ index: 0, observation: { counter: 0 }, action: "increment", reward: 1, next_observation: { counter: 1 }, terminated: true, truncated: false }] }],
  });
}

describe("snapshot audit", () => {
  it("compares transition fields and reports hashes without private values", () => {
    const source = fixture();
    const target = fixture("recorded");
    expect(auditSnapshots({ source, target }).status).toBe("pass");
    target.episodes[0]!.steps[0]!.action = "private-action";
    const report = auditSnapshots({ source, target });
    expect(report.status).toBe("fail");
    expect(report.summary.comparedSteps).toBe(1);
    expect(report.findings[0]).toMatchObject({ code: "transition.changed", episode: 1, step: 0, field: "action" });
    expect(JSON.stringify(report)).not.toContain("private-action");
    expect(JSON.stringify(report)).not.toContain("private-episode");
  });
  it("hashes object keys canonically and rejects malformed boundaries", () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
    expect(() => parseSnapshot({ format: "unknown" })).toThrow("documented Avalon");
    expect(() => auditSnapshots({ source: fixture(), target: fixture(), policy: { absoluteTolerance: -1, relativeTolerance: 0 } })).toThrow("nonnegative");
  });
});

describe("recursive numeric comparison", () => {
  it("applies absolute and relative tolerances to nested numbers only", () => {
    const source = fixture();
    const target = fixture("learner");
    source.episodes[0]!.steps[0]!.observation = { nested: [1000, 0] };
    target.episodes[0]!.steps[0]!.observation = { nested: [1000.5, 0.0001] };
    const policy = { absoluteTolerance: 0.001, relativeTolerance: 0.001 };
    expect(auditSnapshots({ source, target, policy }).status).toBe("pass");
    expect(auditSnapshots({ source, target }).status).toBe("fail");
    target.episodes[0]!.steps[0]!.observation = { nested: ["1000", 0] };
    expect(auditSnapshots({ source, target, policy }).status).toBe("fail");
  });
  it("preserves array order and object shape within a tolerance", () => {
    const source = fixture();
    const target = fixture("learner");
    source.episodes[0]!.steps[0]!.observation = { values: [1, 2], present: null };
    target.episodes[0]!.steps[0]!.observation = { values: [2, 1] };
    expect(auditSnapshots({ source, target, policy: { absoluteTolerance: 10, relativeTolerance: 0 } }).status).toBe("fail");
    expect(() => contentHash(Number.NaN)).toThrow("finite JSON");
    expect(() => parseSnapshot({ ...fixture(), seed: Number.POSITIVE_INFINITY })).toThrow("documented Avalon");
    expect(() => auditSnapshots({ source, target, policy: { absoluteTolerance: 0, relativeTolerance: Number.NaN } })).toThrow("nonnegative");
  });
});

describe("key coverage", () => {
  it("reports extra episodes and transitions", () => {
    const source = fixture();
    const target = parseSnapshot({ ...fixture("recorded"), episodes: [
      { ...fixture().episodes[0], steps: [...fixture().episodes[0]!.steps, { ...fixture().episodes[0]!.steps[0], index: 1 }] },
      { ...fixture().episodes[0], id: "extra-private" },
    ] });
    const report = auditSnapshots({ source, target });
    expect(report.findings.map(item => item.code)).toEqual(expect.arrayContaining(["episode.extra", "step.extra"]));
    expect(JSON.stringify(report)).not.toContain("extra-private");
  });
  it("rejects ambiguous duplicate keys instead of comparing the first match", () => {
    const source = fixture();
    const duplicateEpisode = parseSnapshot({ ...fixture(), episodes: [fixture().episodes[0], fixture().episodes[0]] });
    expect(auditSnapshots({ source, target: duplicateEpisode }).findings.map(item => item.code)).toContain("target.episode.duplicate");
    const duplicateStep = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], steps: [fixture().episodes[0]!.steps[0], fixture().episodes[0]!.steps[0]] }] });
    const report = auditSnapshots({ source, target: duplicateStep });
    expect(report.findings.map(item => item.code)).toContain("target.step.duplicate");
    expect(report.summary.comparedSteps).toBe(0);
  });
  it("detects reordered keys while joining matching transitions", () => {
    const source = parseSnapshot({ ...fixture(), episodes: [fixture().episodes[0], { ...fixture().episodes[0], id: "second" }] });
    const target = parseSnapshot({ ...source, episodes: [...source.episodes].reverse() });
    expect(auditSnapshots({ source, target }).findings.map(item => item.code)).toContain("episode.reordered");
    const twoSteps = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], steps: [fixture().episodes[0]!.steps[0], { ...fixture().episodes[0]!.steps[0], index: 1 }] }] });
    const reversed = parseSnapshot({ ...twoSteps, episodes: [{ ...twoSteps.episodes[0], steps: [...twoSteps.episodes[0]!.steps].reverse() }] });
    expect(auditSnapshots({ source: twoSteps, target: reversed }).findings.map(item => item.code)).toContain("step.reordered");
    expect(auditSnapshots({ source: twoSteps, target: reversed }).summary.comparedSteps).toBe(2);
  });
});
