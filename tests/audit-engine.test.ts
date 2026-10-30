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

describe("episode context", () => {
  it("preserves task identity and categorical metadata without exposing their values", () => {
    const source = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], metadata: { mission: "private-mission", category: 1 } }] });
    const target = parseSnapshot({ ...source, stage: "recorded", episodes: [{ ...source.episodes[0], task: "private-task", metadata: { mission: "other-private", category: 1.0001 } }] });
    const report = auditSnapshots({ source, target, policy: { absoluteTolerance: 100, relativeTolerance: 100 } });
    expect(report.findings.map(item => item.code)).toEqual(expect.arrayContaining(["episode.task.changed", "episode.metadata.changed"]));
    expect(JSON.stringify(report)).not.toMatch(/private-mission|private-task|other-private/);
  });
  it("distinguishes missing metadata, empty metadata, and null metadata values", () => {
    const source = fixture();
    const empty = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], metadata: {} }] });
    expect(auditSnapshots({ source, target: empty }).findings.map(item => item.code)).toContain("episode.metadata.changed");
    const nullable = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], metadata: { mission: null } }] });
    expect(auditSnapshots({ source: nullable, target: empty }).status).toBe("fail");
    const ordered = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], metadata: { b: 2, a: "one" } }] });
    const reordered = parseSnapshot({ ...fixture(), episodes: [{ ...fixture().episodes[0], metadata: { a: "one", b: 2 } }] });
    expect(auditSnapshots({ source: ordered, target: reordered }).status).toBe("pass");
  });
});

describe("content contamination", () => {
  it("detects copied experience across splits despite renamed episode keys and metadata", async () => {
    const { auditContamination, episodeFingerprint } = await import("../src/audit/contamination.js");
    const source = fixture();
    const renamed = parseSnapshot({ ...fixture("recorded"), episodes: [{ ...source.episodes[0], id: "renamed-private", task: "renamed-task", metadata: { split: "private" } }] });
    expect(episodeFingerprint(source.episodes[0]!)).toBe(episodeFingerprint(renamed.episodes[0]!));
    const report = auditContamination({ splits: [{ name: "private-train", snapshot: source }, { name: "private-test", snapshot: renamed }] });
    expect(report.status).toBe("fail");
    expect(report.duplicates.map(item => item.kind)).toEqual(["episode", "transition"]);
    expect(report.duplicates[0]!.occurrences).toEqual([{ split: 1, episode: 1 }, { split: 2, episode: 1 }]);
    expect(JSON.stringify(report)).not.toMatch(/private-train|private-test|renamed-private|renamed-task/);
  });
  it("separates within-split repetition from cross-split overlap and detects partial overlap", async () => {
    const { auditContamination } = await import("../src/audit/contamination.js");
    const source = fixture();
    const repeated = parseSnapshot({ ...source, episodes: [source.episodes[0], { ...source.episodes[0], id: "second" }] });
    const one = auditContamination({ splits: [{ name: "train", snapshot: repeated }] });
    expect(one.status).toBe("inconclusive");
    expect(one.duplicates.every(item => item.severity === "warning")).toBe(true);
    const partial = parseSnapshot({ ...source, episodes: [{ ...source.episodes[0], steps: [...source.episodes[0]!.steps, { ...source.episodes[0]!.steps[0], index: 1, action: "different" }] }] });
    const report = auditContamination({ splits: [{ name: "train", snapshot: source }, { name: "test", snapshot: partial }] });
    expect(report.duplicates.map(item => item.kind)).toEqual(["transition"]);
    expect(report.status).toBe("fail");
    expect(() => auditContamination({ splits: [{ name: "same", snapshot: source }, { name: "same", snapshot: source }] })).toThrow("unique name");
  });
});

describe("pipeline audit", () => {
  it("localizes the first corrupt edge and binds all declared artifact hashes", async () => {
    const { auditPipeline } = await import("../src/audit/engine.js");
    const snapshots = [fixture(), fixture("recorded"), fixture("learner")];
    const links = () => snapshots.slice(1).map((snapshot, index) => ({ parentSha256: contentHash(snapshots[index]), childSha256: contentHash(snapshot) }));
    expect(auditPipeline({ snapshots, lineage: links() }).status).toBe("pass");
    snapshots[2]!.episodes[0]!.steps[0]!.action = "private-corruption";
    const report = auditPipeline({ snapshots, lineage: links() });
    expect(report.status).toBe("fail");
    expect(report.firstDivergence).toEqual({ from: 2, to: 3 });
    expect(JSON.stringify(report)).not.toContain("private-corruption");
    expect(auditPipeline({ snapshots }).findings.map(item => item.code)).toContain("lineage.unknown");
    expect(auditPipeline({ snapshots, lineage: [{ parentSha256: "bad", childSha256: "bad" }] }).findings.map(item => item.code)).toEqual(expect.arrayContaining(["lineage.coverage", "lineage.hash.changed"]));
  });
  it("detects cumulative numeric drift that each adjacent tolerance allows", async () => {
    const { auditPipeline } = await import("../src/audit/engine.js");
    const snapshots = [fixture(), fixture("recorded"), fixture("learner")];
    snapshots[1]!.episodes[0]!.steps[0]!.action = 0.009;
    snapshots[0]!.episodes[0]!.steps[0]!.action = 0;
    snapshots[2]!.episodes[0]!.steps[0]!.action = 0.018;
    const lineage = snapshots.slice(1).map((snapshot, index) => ({ parentSha256: contentHash(snapshots[index]), childSha256: contentHash(snapshot) }));
    const report = auditPipeline({ snapshots, lineage, policy: { absoluteTolerance: 0.01, relativeTolerance: 0 } });
    expect(report.edges.every(edge => edge.report.status === "pass")).toBe(true);
    expect(report.status).toBe("fail");
    expect(report.firstDivergence).toEqual({ from: 2, to: 3 });
  });
  it("checks stage order, seed preservation, and evidence relabeling", async () => {
    const { auditPipeline } = await import("../src/audit/engine.js");
    const snapshots = [parseSnapshot({ ...fixture(), evidence: "user-supplied" }), fixture("learner"), parseSnapshot({ ...fixture("recorded"), seed: 8 })];
    const report = auditPipeline({ snapshots });
    expect(report.findings.map(item => item.code)).toEqual(expect.arrayContaining(["pipeline.stage.order", "lineage.seed.changed", "lineage.evidence.changed", "pipeline.coverage.unknown"]));
    expect(() => auditPipeline({ snapshots: [fixture()] })).toThrow("at least two");
  });
});

describe("reproducible witnesses", () => {
  it("reduces evidence and reproduces the selected finding under a fresh audit", async () => {
    const { buildWitness } = await import("../src/audit/engine.js");
    const base = fixture();
    const episodes = [0, 1, 2].map(episode => ({ ...base.episodes[0], id: `episode-${episode}`, steps: [0, 1, 2, 3].map(index => ({ ...base.episodes[0]!.steps[0], index, observation: { counter: index }, next_observation: { counter: index + 1 }, terminated: index === 3 })) }));
    const source = parseSnapshot({ ...base, episodes });
    const target = parseSnapshot({ ...source, stage: "recorded" });
    target.episodes[2]!.steps[1]!.action = "private-witness-action";
    const report = auditSnapshots({ source, target });
    const witness = buildWitness({ source, target, report, findingIndex: report.findings.findIndex(item => item.code === "transition.changed") });
    expect(witness.source.episodes).toHaveLength(1);
    expect(witness.target.episodes).toHaveLength(1);
    expect(witness.source.episodes[0]!.steps).toHaveLength(1);
    expect(witness.target.episodes[0]!.steps).toHaveLength(1);
    expect(witness.sourceOrdinals).toEqual([3]);
    const fresh = auditSnapshots({ source: parseSnapshot(witness.source), target: parseSnapshot(witness.target), policy: witness.report.policy });
    expect(fresh.findings).toContainEqual(expect.objectContaining({ code: "transition.changed", step: 1, field: "action", expectedHash: witness.selected.expectedHash, actualHash: witness.selected.actualHash }));
    expect(contentHash(witness.report)).toBe(contentHash(fresh));
    expect(contentHash(buildWitness({ source, target, report }))).toBe(contentHash(buildWitness({ source, target, report })));
    expect(source.episodes).toHaveLength(3);
    expect(JSON.stringify(witness.report)).not.toContain("private-witness-action");
    expect(witness.privacy).toBe("private-evidence");
  });
  it("rejects stale evidence and fabricated findings", async () => {
    const { buildWitness } = await import("../src/audit/engine.js");
    const source = fixture();
    const target = fixture("recorded");
    target.episodes[0]!.steps[0]!.action = "different";
    const report = auditSnapshots({ source, target });
    const changed = fixture("recorded");
    expect(() => buildWitness({ source, target: changed, report })).toThrow("exact snapshots");
    expect(() => buildWitness({ source, target, report, findingIndex: -1 })).toThrow("existing audit finding");
    expect(() => buildWitness({ source, target, report: { ...report, findings: [{ code: "invented", severity: "error", message: "A fabricated finding." }] } })).toThrow("does not reproduce");
  });
});

describe("pipeline finding coordinates", () => {
  it("localizes seed-only faults with one-based snapshot positions", async () => {
    const { auditPipeline } = await import("../src/audit/engine.js");
    for (const changedOffset of [1, 2]) {
      const snapshots = [fixture(), fixture("recorded"), fixture("learner")];
      snapshots[changedOffset] = parseSnapshot({ ...snapshots[changedOffset], seed: 8 });
      const lineage = snapshots.slice(1).map((snapshot, index) => ({ parentSha256: contentHash(snapshots[index]), childSha256: contentHash(snapshot) }));
      const report = auditPipeline({ snapshots, lineage });
      expect(report.edges.every(edge => edge.report.status === "pass")).toBe(true);
      expect(report.firstDivergence).toEqual({ from: changedOffset, to: changedOffset + 1 });
      expect(report.findings.find(item => item.code === "lineage.seed.changed")?.snapshot).toBe(changedOffset + 1);
    }
  });
  it("localizes hash-only faults on the first and final edges", async () => {
    const { auditPipeline } = await import("../src/audit/engine.js");
    for (const changedOffset of [0, 1]) {
      const snapshots = [fixture(), fixture("recorded"), fixture("learner")];
      const lineage = snapshots.slice(1).map((snapshot, index) => ({ parentSha256: contentHash(snapshots[index]), childSha256: contentHash(snapshot) }));
      lineage[changedOffset]!.childSha256 = "incorrect";
      const report = auditPipeline({ snapshots, lineage });
      expect(report.edges.every(edge => edge.report.status === "pass")).toBe(true);
      expect(report.firstDivergence).toEqual({ from: changedOffset + 1, to: changedOffset + 2 });
    }
  });
});

describe("coverage without false reordering", () => {
  it("does not call a missing predecessor a transition reorder", () => {
    const base = fixture();
    const source = parseSnapshot({ ...base, episodes: [{ ...base.episodes[0], steps: [
      { ...base.episodes[0]!.steps[0], terminated: false },
      { ...base.episodes[0]!.steps[0], index: 1, observation: { counter: 1 }, next_observation: { counter: 2 } },
    ] }] });
    const target = parseSnapshot({ ...source, stage: "recorded", episodes: [{ ...source.episodes[0], steps: [source.episodes[0]!.steps[1]] }] });
    const codes = auditSnapshots({ source, target }).findings.map(item => item.code);
    expect(codes).toContain("step.missing");
    expect(codes).not.toContain("step.reordered");
  });
  it("does not call an omitted episode a reorder of the remaining episodes", () => {
    const source = parseSnapshot({ ...fixture(), episodes: [fixture().episodes[0], { ...fixture().episodes[0], id: "second" }] });
    const target = parseSnapshot({ ...source, episodes: [source.episodes[1]] });
    const codes = auditSnapshots({ source, target }).findings.map(item => item.code);
    expect(codes).toContain("episode.missing");
    expect(codes).not.toContain("episode.reordered");
  });
});

describe("finite numeric overflow", () => {
  it("rejects an opposite-sign difference above the relative tolerance near the finite limit", async () => {
    const { valuesEqual } = await import("../src/audit/engine.js");
    const policy = { absoluteTolerance: 0, relativeTolerance: 1.9 };
    expect(valuesEqual({ expected: 1e308, actual: -1e308, policy })).toBe(false);
    expect(valuesEqual({ expected: -1e308, actual: 1e308, policy })).toBe(false);
    const source = fixture();
    const target = fixture("recorded");
    source.episodes[0]!.steps[0]!.action = 1e308;
    target.episodes[0]!.steps[0]!.action = -1e308;
    expect(auditSnapshots({ source, target, policy }).status).toBe("fail");
    expect(valuesEqual({ expected: 1e308, actual: -1e308, policy: { absoluteTolerance: 0, relativeTolerance: 2 } })).toBe(true);
  });
  it("preserves the tolerance rule across power-of-two scales and subnormal values", async () => {
    const { valuesEqual } = await import("../src/audit/engine.js");
    for (const exponent of [-1000, 0, 1000]) {
      const scale = 2 ** exponent;
      expect(valuesEqual({ expected: 4 * scale, actual: -4 * scale, policy: { absoluteTolerance: scale, relativeTolerance: 1.5 } })).toBe(false);
      expect(valuesEqual({ expected: 4 * scale, actual: -4 * scale, policy: { absoluteTolerance: 2 * scale, relativeTolerance: 1.5 } })).toBe(true);
    }
    expect(valuesEqual({ expected: Number.MIN_VALUE, actual: 0, policy: { absoluteTolerance: 0, relativeTolerance: 0.5 } })).toBe(false);
    expect(valuesEqual({ expected: Number.MIN_VALUE, actual: 0, policy: { absoluteTolerance: Number.MIN_VALUE, relativeTolerance: 0 } })).toBe(true);
    expect(valuesEqual({ expected: 0, actual: -0, policy: { absoluteTolerance: 0, relativeTolerance: 0 } })).toBe(true);
  });
});
