import { describe, expect, it } from "vitest";
import { parseSnapshot, stepSchema, type Snapshot } from "../src/lab/contract.js";
import { parseTraceContract } from "../src/trace/contract.js";
import { auditTraceContract } from "../src/trace/audit.js";

export function traceFixture(): Snapshot {
  return parseSnapshot({ format: "avalon.snapshot/v1", stage: "source", producer: { name: "fixture", version: "1" }, seed: 7,
    evidence: "synthetic", episodes: [{ id: "private-id", task: "private-task", steps: [{ index: 0,
      observation: { done: false, protected: "private-value", amount: 100 }, action: { type: "finish" }, reward: 1,
      next_observation: { done: true, protected: "private-value", amount: 100.01 }, terminated: true, truncated: false }] }] });
}

describe("final outcome contracts", () => {
  const contract = parseTraceContract({ format: "avalon.trace-contract/v1", name: "fixture", rules: [
    { id: "goal", kind: "final-equals", path: ["done"], expected: true },
    { id: "frame", kind: "preserve", path: ["protected"], scope: "final" },
    { id: "amount", kind: "final-equals", path: ["amount"], expected: 100, tolerance: { absolute: 0.02, relative: 0 } },
  ] });
  it("accepts independent goals and frame rules without exposing raw evidence", () => {
    const report = auditTraceContract({ snapshot: traceFixture(), contract });
    expect(report.status).toBe("match");
    expect(report.summary.matches).toBe(3);
    for (const secret of ["private-value", "private-id", "private-task"]) expect(JSON.stringify(report)).not.toContain(secret);
  });
  it("separates an observed mismatch from missing or malformed evidence", () => {
    const snapshot = traceFixture();
    snapshot.episodes[0]!.steps[0]!.next_observation = { done: false, protected: "changed" };
    const report = auditTraceContract({ snapshot, contract });
    expect(report.status).toBe("mismatch");
    expect(report.summary).toMatchObject({ mismatches: 2, unknowns: 1, rewardedMismatches: 1 });
    snapshot.episodes[0]!.steps[0]!.terminated = false;
    expect(auditTraceContract({ snapshot, contract }).checks.every(check => check.code === "trace.incomplete")).toBe(true);
  });
  it("keeps duplicate identities and inconsistent continuity unknown", () => {
    const snapshot = traceFixture();
    snapshot.episodes.push(structuredClone(snapshot.episodes[0]!));
    expect(auditTraceContract({ snapshot, contract }).checks.every(check => check.code === "episode.ambiguous")).toBe(true);
    snapshot.episodes.pop();
    const first = snapshot.episodes[0]!.steps[0]!;
    first.terminated = false;
    snapshot.episodes[0]!.steps.push(stepSchema.parse({ ...first, index: 1, observation: { altered: true }, terminated: true }));
    expect(auditTraceContract({ snapshot, contract }).checks.every(check => check.code === "trace.invalid")).toBe(true);
  });
});
