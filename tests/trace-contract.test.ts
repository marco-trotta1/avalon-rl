import { describe, expect, it } from "vitest";
import { parseTraceContract, resolveTracePath, tracePathSchema } from "../src/trace/contract.js";

describe("trace contract boundary", () => {
  it("keeps object keys distinct from array indices and missing values from null", () => {
    const value = { "0": null, nested: [{ "a.b": 4 }] };
    expect(resolveTracePath({ value, path: tracePathSchema.parse(["0"]) })).toEqual({ status: "present", value: null });
    expect(resolveTracePath({ value, path: tracePathSchema.parse([0]) })).toEqual({ status: "missing" });
    expect(resolveTracePath({ value, path: tracePathSchema.parse(["nested", 0, "a.b"]) })).toEqual({ status: "present", value: 4 });
    expect(resolveTracePath({ value, path: tracePathSchema.parse(["nested", "0"]) })).toEqual({ status: "missing" });
    expect(resolveTracePath({ value, path: tracePathSchema.parse(["toString"]) })).toEqual({ status: "missing" });
  });
  it("rejects ambiguous rules, unknown fields, invalid paths, and invalid tolerances", () => {
    const rule = { id: "goal", kind: "final-equals", path: ["done"], expected: true };
    const contract = { format: "avalon.trace-contract/v1", name: "fixture", rules: [rule] };
    expect(parseTraceContract(contract).rules).toHaveLength(1);
    for (const invalid of [
      { ...contract, rules: [rule, rule] }, { ...contract, hidden: true },
      { ...contract, rules: [{ ...rule, path: [-1] }] },
      { ...contract, rules: [{ ...rule, tolerance: { absolute: -1, relative: 0 } }] },
    ]) expect(() => parseTraceContract(invalid)).toThrow("trace contract format");
  });
  it("rejects JSON properties that the shared JSON schema cannot preserve", () => {
    expect(() => parseTraceContract({ format: "avalon.trace-contract/v1", name: "fixture", rules: [
      { id: "goal", kind: "final-equals", path: [], expected: JSON.parse('{"__proto__":{"hidden":true}}') },
    ] })).toThrow("unsupported JSON property");
  });
});
