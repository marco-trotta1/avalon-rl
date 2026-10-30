import { describe, expect, it } from "vitest";
import { auditSnapshots, contentHash } from "../src/audit/engine.js";
import { parseSnapshot, type Snapshot } from "../src/lab/contract.js";

export function fixture(stage: Snapshot["stage"] = "source"): Snapshot {
  return parseSnapshot({
    format: "avalon.snapshot/v1", stage, producer: { name: "fixture", version: "1" }, seed: 7, evidence: "synthetic",
    episodes: [{ id: "private-episode", task: "counter", steps: [{ index: 0, observation: { counter: 0 }, action: "increment", reward: 1, next_observation: { counter: 1 }, terminated: true, truncated: false, ...(stage === "learner" ? { bootstrap_mask: 0 } : {}) }] }],
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

describe("ending and bootstrap semantics", () => {
  it("allows a learner to derive the correct mask from independent ending signals", () => {
    for (const terminated of [false, true]) {
      for (const truncated of [false, true]) {
        const source = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], steps: [{ ...fixture().episodes[0]!.steps[0], terminated, truncated }] }] });
        const target = parseSnapshot({ ...source, stage: "learner", episodes: [{ ...source.episodes[0], steps: [{ ...source.episodes[0]!.steps[0], bootstrap_mask: terminated ? 0 : 1 }] }] });
        expect(auditSnapshots({ source, target }).status).toBe(terminated || truncated ? "pass" : "inconclusive");
        target.episodes[0]!.steps[0]!.bootstrap_mask = terminated ? 1 : 0;
        expect(auditSnapshots({ source, target }).findings.map(item => item.code)).toContain("target.bootstrap.invalid");
      }
    }
  });
  it("distinguishes missing learner masks, removed supplied masks, and valid truncation", () => {
    const source = fixture();
    const learner = parseSnapshot({ ...source, stage: "learner" });
    expect(auditSnapshots({ source, target: learner }).status).toBe("inconclusive");
    expect(auditSnapshots({ source, target: learner }).findings.map(item => item.code)).toContain("target.bootstrap.unknown");
    const supplied = parseSnapshot({ ...source, episodes: [{ ...source.episodes[0], steps: [{ ...source.episodes[0]!.steps[0], bootstrap_mask: 0 }] }] });
    expect(auditSnapshots({ source: supplied, target: fixture("recorded") }).findings.map(item => item.code)).toContain("bootstrap.removed");
    const truncated = parseSnapshot({ ...source, episodes: [{ ...source.episodes[0], steps: [{ ...source.episodes[0]!.steps[0], terminated: false, truncated: true, bootstrap_mask: 1 }] }] });
    expect(auditSnapshots({ source: truncated, target: truncated }).status).toBe("pass");
  });
  it("detects conflated termination and truncation even when their union matches", () => {
    const source = fixture();
    const target = parseSnapshot({ ...fixture("recorded"), episodes: [{ ...source.episodes[0], steps: [{ ...source.episodes[0]!.steps[0], terminated: false, truncated: true }] }] });
    const fields = auditSnapshots({ source, target }).findings.map(item => item.field);
    expect(fields).toContain("terminated");
    expect(fields).toContain("truncated");
  });
});

describe("sequence invariants", () => {
  it("rejects internal discontinuity even when both stages contain the same corruption", () => {
    const base = fixture();
    const broken = parseSnapshot({ ...base, episodes: [{ ...base.episodes[0], steps: [
      { ...base.episodes[0]!.steps[0], terminated: false },
      { ...base.episodes[0]!.steps[0], index: 1, observation: { counter: 9 }, next_observation: { counter: 10 } },
    ] }] });
    const report = auditSnapshots({ source: broken, target: broken });
    expect(report.status).toBe("fail");
    expect(report.findings.map(item => item.code)).toContain("source.continuity.changed");
    expect(report.findings.map(item => item.code)).toContain("target.continuity.changed");
  });
  it("rejects steps after either ending signal and marks incomplete evidence unknown", () => {
    const base = fixture();
    for (const ending of ["terminated", "truncated"] as const) {
      const afterEnd = parseSnapshot({ ...base, episodes: [{ ...base.episodes[0], steps: [
        { ...base.episodes[0]!.steps[0], terminated: false, [ending]: true },
        { ...base.episodes[0]!.steps[0], index: 1, observation: { counter: 1 } },
      ] }] });
      expect(auditSnapshots({ source: afterEnd, target: afterEnd }).findings.map(item => item.code)).toContain("source.episode.after_end");
    }
    const partial = parseSnapshot({ ...base, episodes: [{ ...base.episodes[0], steps: [{ ...base.episodes[0]!.steps[0], index: 2, terminated: false }] }] });
    const report = auditSnapshots({ source: partial, target: partial });
    expect(report.status).toBe("inconclusive");
    expect(report.findings.map(item => item.code)).toEqual(expect.arrayContaining(["source.episode.prefix", "source.episode.open"]));
  });
  it("marks a transition gap unknown without assuming adjacency", () => {
    const base = fixture();
    const gap = parseSnapshot({ ...base, episodes: [{ ...base.episodes[0], steps: [
      { ...base.episodes[0]!.steps[0], terminated: false },
      { ...base.episodes[0]!.steps[0], index: 2, observation: { counter: 2 } },
    ] }] });
    const report = auditSnapshots({ source: gap, target: gap });
    expect(report.status).toBe("inconclusive");
    expect(report.findings.map(item => item.code)).toContain("source.step.gap");
    expect(report.findings.map(item => item.code)).not.toContain("source.continuity.changed");
  });
});
