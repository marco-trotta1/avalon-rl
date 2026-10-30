import { describe, expect, it } from "vitest";
import { auditTraceContract } from "../src/trace/audit.js";
import { makeTraceBenchmarkFixtures, runTraceBenchmark, simpleTraceAssertion } from "../src/trace/benchmark.js";

describe("trace control comparison", () => {
  it("retains valid alternatives, known faults, and insufficient-evidence controls", () => {
    for (const seed of [7, 31, 101]) for (const fixture of makeTraceBenchmarkFixtures({ seed })) {
      expect(auditTraceContract(fixture).status).toBe(fixture.expected);
      expect(simpleTraceAssertion(fixture)).toBe(fixture.expected);
    }
  });
  it("reports the assertion tie and does not count timing repetitions as accuracy cases", () => {
    const report = runTraceBenchmark({ seed: 7, repetitions: 2 });
    expect(report.uniqueCases).toBe(28);
    expect(report.comparison).toEqual({ correctDifference: 0, identicalVerdicts: true });
    const assertion = report.results.find(result => result.method === "simple-full-assertion")!;
    const candidate = report.results.find(result => result.method === "avalon-trace-contract")!;
    expect(candidate).toMatchObject({ correct: 28, falseAccepts: 0, falseRejects: 0, abstentions: 4 });
    expect(assertion.correct).toBe(candidate.correct);
    expect(candidate.latency.sampleSize).toBe(56);
    expect(candidate.apiCalls).toBe(0);
    expect(candidate.apiCostUsd).toBe(0);
    expect(report.results.find(result => result.method === "weak-claim")!.falseAccepts).toBe(12);
  });
});
