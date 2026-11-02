import { describe, expect, it } from "vitest";
import { contentHash } from "../src/audit/engine.js";
import { demoFailureCase, failureCaseHash, parseFailureCase, type FailureCase } from "../src/failure/case.js";
import { parseFailureReview, prepareFailurePackage } from "../src/failure/package.js";

function authorizedCase(): FailureCase {
  return parseFailureCase({ ...demoFailureCase(), rights: {
    status: "authorized", owner: "Example contributor", allowedUses: ["evaluation"], attestedAt: "2026-11-01T00:00:00Z",
  } });
}
function review(failure: FailureCase) {
  return { caseHash: failureCaseHash(failure), reviewer: "Example reviewer", reviewedAt: "2026-11-01T01:00:00Z",
    privacyApproved: true, checksApproved: true };
}

describe("failure package readiness", () => {
  it("keeps private cases blocked and excludes their content", () => {
    const failure = demoFailureCase();
    expect(prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: review(failure) }))
      .toEqual({ status: "blocked", reasons: ["rights-private"] });
  });

  it("requires permission for the exact use", () => {
    const failure = authorizedCase();
    expect(prepareFailurePackage({ case: failure, requestedUse: "training", review: review(failure) }))
      .toEqual({ status: "blocked", reasons: ["use-not-permitted"] });
  });

  it("requires explicit approval and binds it to all case content", () => {
    const failure = authorizedCase();
    for (const invalid of [undefined, { ...review(failure), privacyApproved: false }, { ...review(failure), checksApproved: false }]) {
      expect(prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: invalid }))
        .toEqual({ status: "blocked", reasons: ["review-required"] });
    }
    const changed = parseFailureCase({ ...failure, title: "A changed title" });
    expect(prepareFailurePackage({ case: changed, requestedUse: "evaluation", review: review(failure) }))
      .toEqual({ status: "blocked", reasons: ["review-stale"] });
    expect(() => parseFailureReview({ ...review(failure), reviewedAt: "yesterday" })).toThrow();
  });

  it("requires failing observed evidence and a passing reference", () => {
    const original = authorizedCase();
    for (const files of [
      { ...original.files, observed: original.files.reference },
      { ...original.files, reference: original.files.observed },
    ]) {
      const failure = parseFailureCase({ ...original, files });
      expect(prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: review(failure) }))
        .toEqual({ status: "blocked", reasons: ["failure-unresolved"] });
    }
  });

  it("blocks secret patterns in snapshots and metadata without leaking them", () => {
    const secret = "ghp_" + "a".repeat(36);
    const original = authorizedCase();
    const cases = [
      { ...original, description: secret },
      { ...original, files: { ...original.files, initial: { ...original.files.initial, "secret.txt": secret } } },
      { ...original, checks: [...original.checks, { kind: "equals", path: "secret.txt", expected: secret }] },
    ];
    for (const value of cases) {
      const failure = parseFailureCase(value);
      const result = prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: review(failure) });
      expect(result.status).toBe("blocked");
      if (result.status === "blocked") expect(result.reasons).toContain("sensitive-content");
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it("returns a deterministic package and preserves its case snapshot", () => {
    const failure = authorizedCase();
    const result = prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: review(failure) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready package.");
    expect(result.packageHash).toBe(contentHash(result.package));
    expect(result).toEqual(prepareFailurePackage({ case: failure, requestedUse: "evaluation", review: review(failure) }));
    failure.description = "Changed after packaging";
    expect(result.package.case.description).not.toBe(failure.description);
    expect(result.package.caseHash).toBe(failureCaseHash(result.package.case));
  });
});
