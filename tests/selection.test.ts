import { describe, expect, it } from "vitest";
import { parseSelection, selectCandidates } from "../src/agent/selection.js";

const planSha256 = "a".repeat(64);

function fixture({ count = 1000, values = [0.1, 0.9], direction = "maximize", delta = 0.05 }:
  { count?: number; values?: number[]; direction?: "maximize" | "minimize"; delta?: number } = {}) {
  const sampleIds = Array.from({ length: count }, (_, index) => String(index));
  const candidates = values.map((_, index) => ({ id: index === 0 ? "random" : `candidate-${index}`, artifactSha256: String(index).repeat(64) }));
  const plan = {
    format: "avalon-selection-plan-v1", baselineId: "random",
    metric: { name: "completion", lower: 0, upper: 1, direction }, delta, minImprovement: 0,
    sampling: { unit: "held-out-task", assumption: "independent", seed: 7, sampleIds }, candidates,
  };
  const scores = {
    format: "avalon-selection-scores-v1", planSha256,
    candidates: candidates.map((candidate, index) => ({
      ...candidate, status: "complete" as const,
      samples: sampleIds.map(sampleId => ({ sampleId, value: values[index] ?? 0 })),
      latencyMs: 12, cost: { externalApiUsd: 0, computeUsd: null, hostAgentUsd: null },
    })),
  };
  return { plan, scores, planSha256 };
}

function evaluate(input: ReturnType<typeof fixture>) { return selectCandidates(parseSelection(input)); }

describe("fixed-budget Hoeffding selection", () => {
  it("selects a separated candidate and reports the named simple baseline", () => {
    const report = evaluate(fixture());
    expect(report.decision).toEqual({ status: "selected", candidateId: "candidate-1", reason: "separated-bounds" });
    expect(report.simpleBaseline).toEqual({ method: "empirical-mean", candidateIds: ["candidate-1"] });
    const candidate = report.candidates[1];
    if (candidate?.status !== "complete") throw new Error("Missing complete candidate.");
    expect(candidate.radius).toBeCloseTo(Math.sqrt(Math.log(80) / 2000), 12);
    expect(candidate.mean).toBeCloseTo(0.9, 12);
    expect(candidate.cost.computeUsd).toBeNull();
    expect(report.confidence.assumptionStatus).toBe("declared, not verified");
  });

  it("retains an empirical leader without selecting it when the bounds overlap", () => {
    const report = evaluate(fixture({ count: 8 }));
    expect(report.empiricalLeaders).toEqual(["candidate-1"]);
    expect(report.decision).toEqual({ status: "inconclusive", reason: "overlapping-bounds" });
    expect(report.decision).not.toHaveProperty("candidateId");
  });

  it("preserves ties without creating a selected winner", () => {
    const report = evaluate(fixture({ values: [0.5, 0.5] }));
    expect(new Set(report.empiricalLeaders)).toEqual(new Set(["random", "candidate-1"]));
    expect(report.decision.status).toBe("inconclusive");
  });

  it("preserves a tie when a large metric offset exceeds its score range", () => {
    const input = fixture({ count: 76, values: [1e12, 1e12] });
    input.plan.metric.lower = 1e12 - 0.01;
    input.plan.metric.upper = 1e12;
    const report = evaluate(input);
    expect(report.decision.status).toBe("inconclusive");
    expect(new Set(report.empiricalLeaders)).toEqual(new Set(["random", "candidate-1"]));
    for (const candidate of report.candidates) {
      if (candidate.status !== "complete") throw new Error("Missing complete candidate.");
      expect(candidate.interval.lower).toBeLessThanOrEqual(candidate.interval.upper);
      expect(candidate.mean).toBeLessThanOrEqual(input.plan.metric.upper);
    }
  });

  it("preserves the selection across metric scales and offsets", () => {
    for (const { lower, upper } of [{ lower: -10, upper: 90 }, { lower: 1e12 - 0.01, upper: 1e12 }, { lower: 0, upper: Number.MIN_VALUE }]) {
      const input = fixture({ values: [0, 1] });
      input.plan.metric.lower = lower;
      input.plan.metric.upper = upper;
      for (const candidate of input.scores.candidates) {
        for (const sample of candidate.samples) sample.value = sample.value > 0 ? upper : lower;
      }
      expect(evaluate(input).decision).toEqual({ status: "selected", candidateId: "candidate-1", reason: "separated-bounds" });
    }
  });

  it("supports a lower-is-better metric and can retain the baseline", () => {
    const report = evaluate(fixture({ direction: "minimize" }));
    expect(report.decision).toEqual({ status: "selected", candidateId: "random", reason: "separated-bounds" });
  });

  it("requires the declared improvement over the baseline", () => {
    const input = fixture();
    input.plan.minImprovement = 0.8;
    expect(evaluate(input).decision).toEqual({ status: "inconclusive", reason: "baseline-margin" });
  });

  it("accounts for every planned candidate and remains invariant to score order", () => {
    const input = fixture({ values: [0.1, 0.9, 0.3] });
    const before = evaluate(input);
    input.scores.candidates.reverse();
    for (const candidate of input.scores.candidates) candidate.samples.reverse();
    expect(evaluate(input)).toEqual(before);
    const candidate = before.candidates[0];
    if (candidate?.status !== "complete") throw new Error("Missing complete candidate.");
    expect(candidate.radius).toBeCloseTo(Math.sqrt(Math.log(120) / 2000), 12);
  });

  it("widens intervals for more candidates or a smaller error allowance, and narrows them for more samples", () => {
    const radius = (input: ReturnType<typeof fixture>) => {
      const candidate = evaluate(input).candidates[0];
      if (candidate?.status !== "complete") throw new Error("Missing complete candidate.");
      return candidate.radius;
    };
    for (const count of [10, 100, 1000]) {
      const base = radius(fixture({ count }));
      expect(radius(fixture({ count, values: [0.1, 0.9, 0.3] }))).toBeGreaterThan(base);
      expect(radius(fixture({ count, delta: 0.01 }))).toBeGreaterThan(base);
      expect(radius(fixture({ count: count * 2 }))).toBeLessThan(base);
    }
  });

  it("keeps a failed candidate in an inconclusive report", () => {
    const input = fixture();
    const first = input.scores.candidates[0];
    const second = input.scores.candidates[1];
    if (first === undefined || second === undefined) throw new Error("Missing test candidate.");
    const scores = { ...input.scores, candidates: [first, {
      id: second.id, artifactSha256: second.artifactSha256, status: "failed", reason: "The evaluation fails.",
      latencyMs: 3, cost: second.cost,
    }] };
    const report = selectCandidates(parseSelection({ ...input, scores }));
    expect(report.decision).toEqual({ status: "inconclusive", reason: "candidate-failed" });
    expect(report.candidates[1]).toMatchObject({ status: "failed", reason: "The evaluation fails." });
  });

  it("accepts the declared finite-population sampling assumption", () => {
    const input = fixture();
    input.plan.sampling.assumption = "uniform-without-replacement";
    expect(evaluate(input).confidence.sampling.assumption).toBe("uniform-without-replacement");
  });

  it.each(["roster", "artifact", "sample", "missing", "duplicate", "out-of-bounds", "plan-hash", "nonfinite"])("rejects invalid evidence: %s", fault => {
    const input = fixture({ count: 4 });
    const candidate = input.scores.candidates[1];
    const sample = candidate?.samples[0];
    if (candidate === undefined || sample === undefined) throw new Error("Missing test sample.");
    if (fault === "roster") candidate.id = "unexpected";
    if (fault === "artifact") candidate.artifactSha256 = "b".repeat(64);
    if (fault === "sample") sample.sampleId = "unexpected";
    if (fault === "missing") candidate.samples.pop();
    if (fault === "duplicate") candidate.samples[1] = { ...sample };
    if (fault === "out-of-bounds") sample.value = 1.01;
    if (fault === "plan-hash") input.scores.planSha256 = "b".repeat(64);
    if (fault === "nonfinite") sample.value = Number.NaN;
    expect(() => parseSelection(input)).toThrow();
  });

  it.each(["bounds", "baseline", "candidate", "unit", "delta"])("rejects an invalid frozen plan: %s", fault => {
    const input = fixture({ count: 4 });
    if (fault === "bounds") input.plan.metric.upper = 0;
    if (fault === "baseline") input.plan.baselineId = "missing";
    if (fault === "candidate") input.plan.candidates.push({ ...input.plan.candidates[0]! });
    if (fault === "unit") input.plan.sampling.sampleIds[1] = "0";
    if (fault === "delta") input.plan.delta = 0;
    expect(() => parseSelection(input)).toThrow();
  });
});
