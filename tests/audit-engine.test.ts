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
