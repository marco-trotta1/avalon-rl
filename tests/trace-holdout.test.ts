import { describe, expect, it } from "vitest";
import { contentHash } from "../src/audit/engine.js";
import { auditTraceHoldout, parseTraceHoldout } from "../src/trace/holdout.js";

describe("declared trace holdouts", () => {
  const manifest = parseTraceHoldout({ format: "avalon.trace-holdout/v1", name: "held families", disjointBy: ["taskFamily", "mutationFamily"], records: [
    { id: "first", partition: "train", taskFamily: "invoice", mutationFamily: "false-claim", instanceGroup: "a", sha256: contentHash("first") },
    { id: "second", partition: "eval", taskFamily: "ticket", mutationFamily: "restoration", instanceGroup: "b", sha256: contentHash("second") },
  ] });
  it("checks complete groups instead of treating row identifiers as split evidence", () => {
    expect(auditTraceHoldout({ manifest }).status).toBe("match");
    const leaked = structuredClone(manifest);
    leaked.records[1]!.taskFamily = "invoice";
    expect(auditTraceHoldout({ manifest: leaked }).overlaps).toMatchObject([{ axis: "taskFamily", train: 1, eval: 1 }]);
    expect(JSON.stringify(auditTraceHoldout({ manifest: leaked }))).not.toContain("invoice");
  });
  it("always checks exact hash overlap and requires both partitions", () => {
    const leaked = structuredClone(manifest);
    leaked.records[1]!.sha256 = leaked.records[0]!.sha256;
    expect(auditTraceHoldout({ manifest: leaked }).overlaps[0]!.axis).toBe("sha256");
    const absent = structuredClone(manifest);
    absent.records = absent.records.slice(0, 1);
    expect(auditTraceHoldout({ manifest: absent }).status).toBe("unknown");
  });
  it("requires explicit grouping axes and unambiguous artifact identities", () => {
    expect(() => parseTraceHoldout({ ...manifest, disjointBy: [] })).toThrow();
    expect(() => parseTraceHoldout({ ...manifest, records: [manifest.records[0], manifest.records[0]] })).toThrow();
  });
});
