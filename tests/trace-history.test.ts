import { describe, expect, it } from "vitest";
import { parseSnapshot } from "../src/lab/contract.js";
import { auditTraceContract } from "../src/trace/audit.js";
import { parseTraceContract } from "../src/trace/contract.js";

describe("history contracts", () => {
  const snapshot = parseSnapshot({ format: "avalon.snapshot/v1", stage: "source", producer: { name: "fixture", version: "1" },
    seed: 7, evidence: "synthetic", episodes: [{ id: "restored", task: "payments", steps: [
      { index: 0, observation: { protected: 0 }, action: { type: "pay", invoice: "forbidden", authorized: true }, reward: 0,
        next_observation: { protected: 50 }, terminated: false, truncated: false },
      { index: 1, observation: { protected: 50 }, action: { type: "pay", invoice: "forbidden", authorized: true }, reward: 1,
        next_observation: { protected: 0 }, terminated: true, truncated: false },
    ] }] });
  it("detects restored effects and checks authority independently of event labels", () => {
    const contract = parseTraceContract({ format: "avalon.trace-contract/v1", name: "history", rules: [
      { id: "final", kind: "preserve", path: ["protected"], scope: "final" },
      { id: "history", kind: "preserve", path: ["protected"], scope: "every-step" },
      { id: "authority", kind: "action-allowlist", when: { path: ["type"], equals: "pay" }, path: ["invoice"], allowed: ["permitted"] },
    ] });
    const report = auditTraceContract({ snapshot, contract });
    expect(report.checks.map(check => [check.ruleId, check.status, check.code])).toEqual([
      ["final", "match", "frame.matched"], ["history", "mismatch", "history.changed"],
      ["authority", "mismatch", "authority.exceeded"],
    ]);
    expect(report.checks[1]!.step).toBe(0);
  });
  it("does not treat missing action evidence as an allowed action", () => {
    const incomplete = structuredClone(snapshot);
    incomplete.episodes[0]!.steps.forEach(step => { step.action = { type: "pay" }; });
    const contract = parseTraceContract({ format: "avalon.trace-contract/v1", name: "authority", rules: [
      { id: "authority", kind: "action-allowlist", when: { path: ["type"], equals: "pay" }, path: ["invoice"], allowed: ["permitted"] },
    ] });
    expect(auditTraceContract({ snapshot: incomplete, contract }).status).toBe("unknown");
    incomplete.episodes[0]!.steps[1]!.action = { type: "pay", invoice: "forbidden" };
    expect(auditTraceContract({ snapshot: incomplete, contract }).status).toBe("mismatch");
    incomplete.episodes[0]!.steps.forEach(step => { step.action = { type: "finish" }; });
    expect(auditTraceContract({ snapshot: incomplete, contract }).status).toBe("match");
  });
  it("represents no permitted actions with an empty authority list", () => {
    const contract = parseTraceContract({ format: "avalon.trace-contract/v1", name: "deny payments", rules: [
      { id: "authority", kind: "action-allowlist", when: { path: ["type"], equals: "pay" }, path: ["invoice"], allowed: [] },
    ] });
    expect(auditTraceContract({ snapshot, contract }).status).toBe("mismatch");
    const unrelated = structuredClone(snapshot);
    unrelated.episodes[0]!.steps.forEach(step => { step.action = { type: "finish" }; });
    expect(auditTraceContract({ snapshot: unrelated, contract }).status).toBe("match");
  });
});
