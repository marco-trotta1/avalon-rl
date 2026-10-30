import { expect, it } from "vitest";
import { runWorldBenchmark } from "../src/world/benchmark.js";

it("compares baselines against independent fixture labels and retains misses", () => {
  const report = runWorldBenchmark({ repetitions: 2 });
  expect(report.uniqueCases).toBe(20);
  expect(report.results.map(item => [item.method, item.correct, item.falseAccepts, item.falseRejects])).toEqual([
    ["accept-all", 8, 12, 0], ["weak-claim", 4, 12, 4], ["task-oracle", 20, 0, 0],
  ]);
  for (const result of report.results) {
    expect(result.sampleSize).toBe(20);
    expect(result.latency.sampleSize).toBe(40);
    expect(result.missedCases).toHaveLength(20 - result.correct);
    expect(result.latency.min).toBeGreaterThanOrEqual(0);
    expect(result.latency.p50).toBeLessThanOrEqual(result.latency.p95);
    expect(result.latency.p95).toBeLessThanOrEqual(result.latency.max);
    expect(result.localComputeCostUsd).toBeNull();
    expect(result.localComputeCostStatus).toBe("unmeasured");
    expect(result.apiCalls).toBe(0);
    expect(result.apiCostUsd).toBe(0);
  }
});

it("pins reproducible inputs while leaving timing as a measurement", () => {
  const first = runWorldBenchmark({ seed: 7, repetitions: 1 });
  const second = runWorldBenchmark({ seed: 7, repetitions: 1 });
  expect(first.fixtureHash).toBe(second.fixtureHash);
  expect(first.versions.zod).toBe("4.6.7");
  expect(first.results.map(item => item.cases)).toEqual(second.results.map(item => item.cases));
  expect(runWorldBenchmark({ seed: 8, repetitions: 1 }).fixtureHash).not.toBe(first.fixtureHash);
  expect(() => runWorldBenchmark({ repetitions: 0 })).toThrow();
});
