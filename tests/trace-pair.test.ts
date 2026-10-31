import { describe, expect, it } from "vitest";
import { parseSnapshot, stepSchema } from "../src/lab/contract.js";
import { auditSnapshots } from "../src/audit/engine.js";
import { auditTracePair, parseTracePairContract } from "../src/trace/pair.js";

describe("declared trace isomorphism", () => {
  const source = parseSnapshot({ format: "avalon.snapshot/v1", stage: "source", producer: { name: "fixture", version: "1" },
    seed: 7, evidence: "synthetic", episodes: [{ id: "left", task: "pay-left", steps: [{ index: 0,
      observation: { records: { alpha: 0 } }, action: { invoice: "alpha" }, reward: 1,
      next_observation: { records: { alpha: 5 } }, terminated: true, truncated: false }] }] });
  const target = parseSnapshot({ ...source, episodes: [{ id: "right", task: "pay-right", steps: [{ index: 0,
    observation: { records: { beta: 0 } }, action: { invoice: "beta" }, reward: 1,
    next_observation: { records: { beta: 5 } }, terminated: true, truncated: false }] }] });
  const contract = parseTracePairContract({ format: "avalon.trace-pair/v1", name: "renaming", pairs: [
    { sourceEpisode: "left", sourceTask: "pay-left", targetEpisode: "right", targetTask: "pay-right" },
  ], renames: [{ from: "alpha", to: "beta" }] });
  it("transforms both scalar identifiers and object keys while preserving all other fields", () => {
    expect(auditTracePair({ source, target, contract }).status).toBe("match");
    const changed = structuredClone(target);
    changed.episodes[0]!.steps[0]!.reward = source.episodes[0]!.steps[0]!.reward;
    changed.episodes[0]!.steps[0]!.next_observation = { records: { beta: 4 } };
    expect(auditTracePair({ source, target: changed, contract }).status).toBe("mismatch");
  });
  it("keeps missing pair members and unpaired evidence unknown", () => {
    const changed = structuredClone(target);
    changed.episodes[0]!.id = "switched";
    expect(auditTracePair({ source, target: changed, contract }).status).toBe("unknown");
    changed.episodes.push(target.episodes[0]!);
    expect(auditTracePair({ source, target: changed, contract }).issues).toContain("pair.coverage");
  });
  it("rejects non-bijective mappings and reports collisions with unchanged identifiers", () => {
    expect(() => parseTracePairContract({ ...contract, renames: [{ from: "alpha", to: "beta" }, { from: "gamma", to: "beta" }] })).toThrow();
    const collision = structuredClone(source);
    collision.episodes[0]!.steps[0]!.action = { invoice: "alpha", existing: "beta" };
    expect(auditTracePair({ source: collision, target, contract }).pairs[0]!.code).toBe("transform.collision");
  });
  it("keeps internally invalid pair members unknown", () => {
    const left = structuredClone(source);
    const right = structuredClone(target);
    for (const snapshot of [left, right]) snapshot.episodes[0]!.steps.push(stepSchema.parse({
      ...snapshot.episodes[0]!.steps[0]!, index: 1,
    }));
    expect(auditTracePair({ source: left, target: right, contract }).status).toBe("unknown");
  });
  it("rejects added or removed optional transition fields in a declared pair", () => {
    const withMask = structuredClone(target);
    withMask.episodes[0]!.steps[0]!.bootstrap_mask = 0;
    expect(auditSnapshots({ source: target, target: withMask }).status).toBe("pass");
    expect(auditTracePair({ source, target: withMask, contract }).status).toBe("mismatch");
    const sourceWithMask = structuredClone(source);
    sourceWithMask.episodes[0]!.steps[0]!.bootstrap_mask = 0;
    expect(auditTracePair({ source: sourceWithMask, target, contract }).status).toBe("mismatch");
    expect(auditTracePair({ source: sourceWithMask, target: withMask, contract }).status).toBe("match");
  });
});
