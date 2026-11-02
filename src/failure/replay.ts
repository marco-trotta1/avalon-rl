import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import { failureCaseHash, failureFilesSchema, type FailureCase, type FailureFiles } from "./case.js";

export type FailureCheckResult = Readonly<{
  path: string;
  kind: "equals" | "unchanged";
  status: "pass" | "fail";
  reason: "matched" | "missing" | "different";
}>;
export type FailureEvaluation = Readonly<{
  status: "pass" | "fail";
  checks: readonly FailureCheckResult[];
}>;

export function evaluateFailureSnapshot(options: {
  failureCase: FailureCase;
  files: FailureFiles;
}): FailureEvaluation {
  const { failureCase, files } = options;
  const checks = failureCase.checks.map((check): FailureCheckResult => {
    let expected: string | undefined;
    switch (check.kind) {
      case "equals": expected = check.expected; break;
      case "unchanged": expected = failureCase.files.initial[check.path]; break;
      default: { const exhaustive: never = check; return exhaustive; }
    }
    const exists = Object.hasOwn(files, check.path);
    const reason = !exists || expected === undefined ? "missing"
      : files[check.path] === expected ? "matched" : "different";
    return { path: check.path, kind: check.kind, status: reason === "matched" ? "pass" : "fail", reason };
  });
  return { status: checks.every(check => check.status === "pass") ? "pass" : "fail", checks };
}

const replayLimits = [
  "This report evaluates recorded file contents. It does not execute a model or a program.",
  "The checks describe the supplied contract. They do not establish that the contract is correct or complete.",
  "Final file checks do not detect temporary changes or other side effects.",
] as const;

export function replayFailureCase(failureCase: FailureCase) {
  const observed = evaluateFailureSnapshot({ failureCase, files: failureCase.files.observed });
  const reference = evaluateFailureSnapshot({ failureCase, files: failureCase.files.reference });
  const status: "reproducible" | "unresolved" = observed.status === "fail" && reference.status === "pass"
    ? "reproducible" : "unresolved";
  return {
    format: "avalon.failure-replay.v1" as const,
    caseHash: failureCaseHash(failureCase),
    status,
    observed,
    reference,
    limits: replayLimits,
  };
}

const candidatesSchema = z.array(z.strictObject({
  id: z.string().min(1).max(200),
  files: failureFilesSchema,
})).min(1).max(1000);
export type FailureCandidate = z.infer<typeof candidatesSchema>[number];
export function parseFailureCandidates(value: unknown): FailureCandidate[] {
  return candidatesSchema.parse(value);
}

export type FailureSplit = Readonly<{
  developmentFamilyIds: readonly string[];
  holdoutFamilyIds: readonly string[];
}>;

type Outcome = "improved" | "regressed" | "unchanged";
function outcome(options: { baseline: FailureEvaluation; candidate: FailureEvaluation }): Outcome {
  if (options.baseline.status === options.candidate.status) return "unchanged";
  return options.candidate.status === "pass" ? "improved" : "regressed";
}

function assignSplits(options: { cases: readonly FailureCase[]; split?: FailureSplit }) {
  const assignments = new Map<string, "development" | "holdout" | "unsplit">();
  const families = new Set(options.cases.map(item => item.familyId));
  if (!options.split) {
    for (const family of families) assignments.set(family, "unsplit");
    return assignments;
  }
  for (const [name, ids] of [
    ["development", options.split.developmentFamilyIds],
    ["holdout", options.split.holdoutFamilyIds],
  ] as const) {
    for (const id of ids) {
      if (!families.has(id)) throw new Error("The split contains an unknown family.");
      if (assignments.has(id)) throw new Error("Assign each family to one split only.");
      assignments.set(id, name);
    }
  }
  if (assignments.size !== families.size) throw new Error("Assign every family to a split.");
  if (!options.split.holdoutFamilyIds.length || !options.split.developmentFamilyIds.length) {
    throw new Error("Supply development and holdout families.");
  }
  return assignments;
}

export function compareFailureCases(options: {
  cases: readonly FailureCase[];
  candidates: readonly FailureCandidate[];
  split?: FailureSplit;
}) {
  if (!options.cases.length) throw new Error("Supply at least one failure case.");
  const casesById = new Map(options.cases.map(item => [item.id, item]));
  const candidatesById = new Map(options.candidates.map(item => [item.id, item]));
  if (casesById.size !== options.cases.length) throw new Error("Use a unique case ID for each case.");
  if (candidatesById.size !== options.candidates.length) throw new Error("Use a unique candidate ID for each candidate.");
  if (candidatesById.size !== casesById.size || [...casesById.keys()].some(id => !candidatesById.has(id))) {
    throw new Error("Supply exactly one candidate for each case.");
  }
  const assignments = assignSplits(options);
  const rows = options.cases.map(failureCase => {
    const replay = replayFailureCase(failureCase);
    const candidate = evaluateFailureSnapshot({ failureCase, files: candidatesById.get(failureCase.id)!.files });
    return {
      id: failureCase.id,
      familyId: failureCase.familyId,
      split: assignments.get(failureCase.familyId)!,
      caseHash: replay.caseHash,
      candidateHash: contentHash(candidatesById.get(failureCase.id)!.files),
      taskHash: contentHash({
        initial: failureCase.files.initial,
        checks: [...failureCase.checks].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
      }),
      replayStatus: replay.status,
      baseline: replay.observed,
      candidate,
      outcome: outcome({ baseline: replay.observed, candidate }),
    };
  });
  const taskSplits = new Map<string, "development" | "holdout" | "unsplit">();
  for (const row of rows) {
    const previousSplit = taskSplits.get(row.taskHash);
    if (previousSplit !== undefined && previousSplit !== row.split) {
      throw new Error("Keep identical task contents in the same split.");
    }
    taskSplits.set(row.taskHash, row.split);
  }
  function summarize(subset: typeof rows) {
    return {
      cases: subset.length,
      baselinePassed: subset.filter(row => row.baseline.status === "pass").length,
      candidatePassed: subset.filter(row => row.candidate.status === "pass").length,
      improved: subset.filter(row => row.outcome === "improved").length,
      regressed: subset.filter(row => row.outcome === "regressed").length,
      unchanged: subset.filter(row => row.outcome === "unchanged").length,
      unresolved: subset.filter(row => row.replayStatus === "unresolved").length,
    };
  }
  return {
    format: "avalon.failure-comparison.v1" as const,
    baseline: "recorded-observed-files" as const,
    rows,
    summary: summarize(rows),
    bySplit: {
      development: summarize(rows.filter(row => row.split === "development")),
      holdout: summarize(rows.filter(row => row.split === "holdout")),
      unsplit: summarize(rows.filter(row => row.split === "unsplit")),
    },
    limits: [
      ...replayLimits,
      "Counts describe these supplied cases. No population estimate or model improvement is established.",
      "Task hashes detect exact initial files and checks. Related variants still require family review.",
      "Family separation does not establish that a candidate was developed without holdout access.",
      "Model latency, model cost, and training effects are not measured by this file comparison.",
    ],
  };
}
