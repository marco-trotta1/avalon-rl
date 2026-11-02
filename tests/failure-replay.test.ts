import { describe, expect, it } from "vitest";
import { contentHash } from "../src/audit/engine.js";
import { demoFailureCase, parseFailureCase } from "../src/failure/case.js";
import { compareFailureCases, evaluateFailureSnapshot, parseFailureCandidates, replayFailureCase } from "../src/failure/replay.js";

describe("recorded failure replay", () => {
  it("detects the protected change and accepts the reference", () => {
    const report = replayFailureCase(demoFailureCase());
    expect(report.status).toBe("reproducible");
    expect(report.observed.checks).toEqual([
      { path: "src/add.ts", kind: "equals", status: "pass", reason: "matched" },
      { path: "config.json", kind: "unchanged", status: "fail", reason: "different" },
    ]);
    expect(report.reference.status).toBe("pass");
  });

  it("fails every check when the candidate omits the files", () => {
    const result = evaluateFailureSnapshot({ failureCase: demoFailureCase(), files: {} });
    expect(result.status).toBe("fail");
    expect(result.checks.every(check => check.reason === "missing")).toBe(true);
  });

  it.each(["observed-passes", "reference-fails"])("retains unresolved evidence when %s", mode => {
    const source = demoFailureCase();
    const failureCase = parseFailureCase({ ...source, files: {
      ...source.files,
      ...(mode === "observed-passes" ? { observed: source.files.reference } : { reference: source.files.observed }),
    } });
    expect(replayFailureCase(failureCase).status).toBe("unresolved");
  });

  it("requires own file contents, not inherited values", () => {
    const failureCase = demoFailureCase();
    const files = Object.create(failureCase.files.reference) as Record<string, string>;
    expect(evaluateFailureSnapshot({ failureCase, files }).status).toBe("fail");
  });
});

describe("paired file comparison", () => {
  const failed = demoFailureCase();
  const passed = parseFailureCase({ ...failed, id: "already-passing", familyId: "second-family", files: {
    ...failed.files, initial: { ...failed.files.initial, "task.txt": "A distinct task input" }, observed: failed.files.reference,
  } });
  const candidates = [
    { id: failed.id, files: failed.files.reference },
    { id: passed.id, files: failed.files.observed },
  ];

  it("records gains, regressions, and unresolved baselines without discarding cases", () => {
    const report = compareFailureCases({ cases: [failed, passed], candidates, split: {
      developmentFamilyIds: [failed.familyId], holdoutFamilyIds: [passed.familyId],
    } });
    expect(report.summary).toEqual({ cases: 2, baselinePassed: 1, candidatePassed: 1,
      improved: 1, regressed: 1, unchanged: 0, unresolved: 1 });
    expect(report.rows.map(row => row.split)).toEqual(["development", "holdout"]);
    expect(report.bySplit.development).toEqual({ cases: 1, baselinePassed: 0, candidatePassed: 1,
      improved: 1, regressed: 0, unchanged: 0, unresolved: 0 });
    expect(report.bySplit.holdout).toEqual({ cases: 1, baselinePassed: 1, candidatePassed: 0,
      improved: 0, regressed: 1, unchanged: 0, unresolved: 1 });
    expect(report.bySplit.unsplit.cases).toBe(0);
    expect(report.rows[0]?.candidateHash).toBe(contentHash(candidates[0]!.files));
    expect(report.rows[1]?.candidateHash).toBe(contentHash(candidates[1]!.files));
  });

  it("keeps related variants in the same split", () => {
    const variant = parseFailureCase({ ...failed, id: "variant" });
    const report = compareFailureCases({ cases: [failed, variant, passed], candidates: [
      ...candidates, { id: variant.id, files: variant.files.observed },
    ], split: { developmentFamilyIds: [failed.familyId], holdoutFamilyIds: [passed.familyId] } });
    expect(report.rows.map(row => row.split)).toEqual(["development", "development", "holdout"]);
    expect(report.summary.unchanged).toBe(1);
  });

  it("rejects task copies across splits despite changed labels, outputs, or check order", () => {
    const copy = parseFailureCase({ ...failed, id: "renamed-copy", familyId: "renamed-family",
      title: "Changed metadata", checks: [...failed.checks].reverse(),
      files: { ...failed.files, observed: {}, reference: {} },
    });
    expect(() => compareFailureCases({ cases: [failed, copy], candidates: [
      { id: failed.id, files: failed.files.reference }, { id: copy.id, files: {} },
    ], split: { developmentFamilyIds: [failed.familyId], holdoutFamilyIds: [copy.familyId] } }))
      .toThrow("Keep identical task contents in the same split.");
  });

  it("reports equal task hashes for copies within one split", () => {
    const copy = parseFailureCase({ ...failed, id: "renamed-copy", checks: [...failed.checks].reverse() });
    const report = compareFailureCases({ cases: [failed, copy], candidates: [
      { id: failed.id, files: failed.files.reference }, { id: copy.id, files: {} },
    ] });
    expect(report.rows[0]).toHaveProperty("taskHash");
    expect(report.rows[0]?.taskHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.taskHash).toBe(report.rows[1]?.taskHash);
    expect(report.rows[0]?.candidateHash).not.toBe(report.rows[1]?.candidateHash);
    expect(report.bySplit.unsplit.cases).toBe(2);
  });

  it.each([
    { developmentFamilyIds: [failed.familyId], holdoutFamilyIds: [failed.familyId, passed.familyId] },
    { developmentFamilyIds: [failed.familyId], holdoutFamilyIds: [] },
    { developmentFamilyIds: [failed.familyId], holdoutFamilyIds: ["unknown"] },
  ])("rejects invalid family separation", split => {
    expect(() => compareFailureCases({ cases: [failed, passed], candidates, split })).toThrow();
  });

  it.each([
    [],
    [candidates[0]!],
    [candidates[0]!, candidates[0]!],
    [candidates[0]!, { ...candidates[1]!, id: "unknown" }],
  ].map(invalidCandidates => ({ invalidCandidates })))("rejects missing, duplicate, and unmatched candidate IDs", ({ invalidCandidates }) => {
    expect(() => compareFailureCases({ cases: [failed, passed], candidates: invalidCandidates })).toThrow();
  });

  it("rejects duplicate cases and empty comparisons", () => {
    expect(() => compareFailureCases({ cases: [failed, failed], candidates })).toThrow();
    expect(() => compareFailureCases({ cases: [], candidates: [] })).toThrow();
  });

  it("parses candidate records and rejects unsafe paths and extra fields", () => {
    expect(parseFailureCandidates(candidates)).toEqual(candidates);
    expect(() => parseFailureCandidates([{ id: failed.id, files: { "../secret": "x" } }])).toThrow();
    expect(() => parseFailureCandidates([{ ...candidates[0], extra: true }])).toThrow();
  });
});
