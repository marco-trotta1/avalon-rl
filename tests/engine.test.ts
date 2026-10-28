import { describe, expect, it } from "vitest";
import { aggregateReport, analyzeData, estimateValue } from "../src/lib/engine";
import { demoCase, demoData, syntheticEpisode } from "../src/lib/demo";
import { MAX_FILE_BYTES, parseCase, type AppraisalCase } from "../src/lib/schema";

const inspect = (episodes: unknown[]) => analyzeData({ kind: "traces", text: episodes.map(value => JSON.stringify(value)).join("\n") });

describe("trace inspection", () => {
  it("counts only complete unique episodes and conserves the record count", async () => {
    const result = await analyzeData({ text: demoData("traces"), kind: "traces" });
    expect(result.eligibleUnits).toBe(240);
    expect(result.duplicateUnits).toBe(12);
    expect(result.incompleteUnits).toBe(6);
    expect(result.invalidUnits).toBe(2);
    expect(result.records).toBe(result.eligibleUnits + result.duplicateUnits + result.incompleteUnits + result.invalidUnits + result.conflictingUnits);
    expect(result.terminatedUnits + result.truncatedUnits).toBe(240);
    expect(result.steps).toBe(480);
  });

  it("keeps truncation eligible and does not interpret zero reward as failure", async () => {
    const episode = syntheticEpisode(0);
    const result = await inspect([episode]);
    expect(result.eligibleUnits).toBe(1);
    expect(result.truncatedUnits).toBe(1);
    expect(result.terminatedUnits).toBe(0);
  });

  it("deduplicates reordered content when episode and task identifiers change", async () => {
    const original = syntheticEpisode(1);
    const copy = {
      ...original, episode_id: "changed-id", task_id: "changed-task",
      observations: original.observations.map(value => typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value),
    };
    const result = await inspect([original, copy]);
    expect(result.eligibleUnits).toBe(1);
    expect(result.duplicateUnits).toBe(1);
  });

  it("deduplicates object keys that have the same language collation", async () => {
    const original = { ...syntheticEpisode(1), observations: [{ a: 1, "a\u0000": 2 }, 1, 2] };
    const copy = { ...original, episode_id: "changed-id", observations: [{ "a\u0000": 2, a: 1 }, 1, 2] };
    const result = await inspect([original, copy]);
    expect(result.eligibleUnits).toBe(1);
    expect(result.duplicateUnits).toBe(1);
  });

  it("rejects both records when an episode identifier names different content", async () => {
    const result = await inspect([syntheticEpisode(1), { ...syntheticEpisode(2), episode_id: "synthetic-1" }]);
    expect(result.conflictingUnits).toBe(2);
    expect(result.eligibleUnits).toBe(0);
  });

  it("rejects misaligned arrays, post-terminal steps, nonfinite rewards, and null observations", async () => {
    const result = await inspect([
      { ...syntheticEpisode(1), rewards: [1] },
      { ...syntheticEpisode(2), terminations: [true, true] },
      { ...syntheticEpisode(3), rewards: [0, null] },
      { ...syntheticEpisode(4), observations: [null, 1, 2] },
    ]);
    expect(result.invalidUnits).toBe(4);
    const nonfinite = JSON.stringify(syntheticEpisode(1)).replace('"rewards":[0,1]', '"rewards":[0,1e400]');
    const parsed = await analyzeData({ kind: "traces", text: nonfinite });
    expect(parsed.invalidUnits).toBe(1);
  });

  it("supports BOM and CRLF without exposing payloads in diagnostics", async () => {
    const secret = "PRIVATE-OBSERVATION-DO-NOT-EXPORT";
    const text = `\uFEFF${JSON.stringify(syntheticEpisode(1))}\r\n${JSON.stringify({ secret })}\r\n`;
    const result = await analyzeData({ text, kind: "traces" });
    expect(result.eligibleUnits).toBe(1);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.inputSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects empty and oversized files", async () => {
    await expect(analyzeData({ text: "", kind: "traces" })).rejects.toThrow("empty");
    await expect(analyzeData({ text: " ".repeat(MAX_FILE_BYTES + 1), kind: "traces" })).rejects.toThrow("10 MiB");
  });
});

describe("environment inspection", () => {
  it("deduplicates task definitions and excludes absent or failed declared tests", async () => {
    const value: { tasks: Record<string, unknown>[] } = JSON.parse(demoData("environment"));
    const first = value.tasks[0];
    if (!first) throw new Error("The fixture needs a task.");
    value.tasks.push({ ...first, id: "renamed" });
    value.tasks.push({ ...first, id: "failed", instruction: "A different task", test_receipt: { passed: 1, total: 2, documentSha256: "f".repeat(64) } });
    value.tasks.push({ ...first, id: "absent", instruction: "Another task", test_receipt: undefined });
    const result = await analyzeData({ text: JSON.stringify(value), kind: "environment" });
    expect(result.eligibleUnits).toBe(12);
    expect(result.duplicateUnits).toBe(1);
    expect(result.incompleteUnits).toBe(2);
    expect(result.declaredTestUnits).toBe(12);
  });
});

describe("market appraisal", () => {
  it("uses the median baseline and observed range with a reproducible synthetic fixture", async () => {
    const appraisal = demoCase("traces");
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    const result = estimateValue({ appraisal, analysis });
    expect(result.status).toBe("estimated");
    if (result.status !== "estimated") return;
    expect(result.medianUsd).toBeCloseTo(15_000, 6);
    expect(result.lowUsd).toBeCloseTo(10_080, 6);
    expect(result.highUsd).toBeCloseTo(21_840, 6);
    expect(result.sampleSize).toBe(5);
    expect(result.mode).toBe("synthetic");
    expect(result.leaveOneOutMedianErrorPct).toBeGreaterThan(0);
  });

  it("withholds prices for unknown rights and fewer than 3 independent transactions", async () => {
    const source = demoCase("traces");
    const appraisal: AppraisalCase = { ...source, asset: { ...source.asset, transferRights: { status: "unknown" } }, comparables: source.comparables.slice(0, 2) };
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    const result = estimateValue({ appraisal, analysis });
    expect(result.status).toBe("withheld");
    expect(result).not.toHaveProperty("medianUsd");
    if (result.status === "withheld") expect(result.reasons.join(" ")).toContain("rights");
  });

  it("does not infer an exclusivity premium or mix sale and license prices", async () => {
    const source = demoCase("traces");
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    for (const rights of [{ type: "exclusive", termMonths: 12 }, { type: "assignment" }] as const) {
      const result = estimateValue({ appraisal: { ...source, asset: { ...source.asset, rights } }, analysis });
      expect(result.status).toBe("withheld");
      expect(result.sampleSize).toBe(0);
    }
  });

  it("excludes stale, future, quoted, mismatched, and oversized comparable deals", async () => {
    const source = demoCase("traces");
    const first = source.comparables[0];
    if (!first) throw new Error("The fixture needs a deal.");
    const changes = [
      { date: "2025-01-01" }, { date: "2026-11-01" },
      { evidence: { ...first.evidence, type: "asking-price" as const } },
      { domain: "another-domain" }, { units: 1 },
      { rights: { type: "nonexclusive", termMonths: 24 } },
      { use: "evaluation" },
      { evidence: { ...first.evidence, reviewedOn: "2026-11-01" } },
    ];
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    for (const change of changes) {
      const appraisal = parseCase(JSON.stringify({ ...source, comparables: [{ ...first, ...change }] }));
      const result = estimateValue({ appraisal, analysis });
      expect(result.sampleSize).toBe(0);
    }
  });

  it("does not inflate the sample with duplicated deals, documents, or counterparty groups", async () => {
    const source = demoCase("traces");
    const first = source.comparables[0];
    if (!first) throw new Error("The fixture needs a deal.");
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    const sameDocument = source.comparables.map(deal => ({ ...deal, evidence: { ...deal.evidence, documentSha256: first.evidence.documentSha256 } }));
    const sameGroup = source.comparables.map(deal => ({ ...deal, counterpartyGroup: "One buyer" }));
    for (const comparables of [sameDocument, sameGroup]) {
      const result = estimateValue({ appraisal: { ...source, comparables }, analysis });
      expect(result.sampleSize).toBe(1);
      expect(result.status).toBe("withheld");
    }
    const duplicatedId = estimateValue({ appraisal: { ...source, comparables: [first, first, first] }, analysis });
    expect(duplicatedId.sampleSize).toBe(0);
  });

  it("is invariant to record order and does not change price when duplicates are added", async () => {
    const appraisal = demoCase("traces");
    const values = Array.from({ length: 240 }, (_, index) => syntheticEpisode(index));
    const base = await inspect(values);
    const duplicated = await inspect([...values.toReversed(), ...values]);
    const first = estimateValue({ appraisal, analysis: base });
    const second = estimateValue({ appraisal: { ...appraisal, comparables: appraisal.comparables.toReversed() }, analysis: duplicated });
    expect(first.status).toBe("estimated");
    if (first.status === "estimated" && second.status === "estimated") {
      expect(second.medianUsd).toBeCloseTo(first.medianUsd, 6);
      expect(second.sampleSize).toBe(first.sampleSize);
    }
  });

  it("exports aggregate results without raw data or private source labels", async () => {
    const appraisal = demoCase("traces");
    const analysis = await analyzeData({ text: demoData("traces"), kind: "traces" });
    const report = JSON.stringify(aggregateReport({ appraisal, analysis, estimate: estimateValue({ appraisal, analysis }) }));
    for (const secret of [appraisal.asset.name, "Synthetic deal", "Synthetic buyer", "Synthetic reviewer", "Invented transaction", '"observations":', '"actions":', '"task_id":', '"episode_id":']) {
      expect(report).not.toContain(secret);
    }
    expect(report).toContain("synthetic");
    expect(report).toContain("15000");
  });
});
