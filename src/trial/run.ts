import { z } from "zod";
import { performance } from "node:perf_hooks";
import { contentHash } from "../audit/engine.js";
import { parseSnapshot } from "../lab/contract.js";
import { parseTraceContract } from "../trace/contract.js";
import { auditTraceContract, type TraceStatus } from "../trace/audit.js";
import { buildTraceWitness } from "../trace/witness.js";

const label = z.string().trim().min(1).max(240);
const milliseconds = z.number().finite().nonnegative().brand<"Milliseconds">();
const usd = z.number().finite().nonnegative().brand<"USD">();
const schema = z.object({
  format: z.literal("avalon.trial/v1"),
  id: label,
  authorization: z.object({ owner: label, reference: label, localUseApproved: z.literal(true) }).strict(),
  protocol: z.object({
    frozenAt: z.iso.datetime(), reviewer: label, baselineName: label,
    dataRevision: label, adapterVersion: label, modelVersion: label,
    setupMinutes: z.number().finite().nonnegative().brand<"Minutes">(),
  }).strict(),
  cases: z.array(z.object({
    id: label, group: label, split: z.enum(["development", "holdout"]),
    origin: z.enum(["observed", "authored-control"]),
    expected: z.enum(["match", "mismatch", "unknown"]), labelEvidence: label,
    execution: z.object({ latencyMs: milliseconds, costUsd: usd }).strict().nullable(),
    snapshot: z.unknown(), contract: z.unknown(), baseline: z.unknown(),
  }).strict()).min(1).max(100),
}).strict();

export function parseTrial(value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("Use the documented Avalon trial format. Confirm local use authorization.");
  const trial = parsed.data;
  const ids = new Set<string>();
  const groups = new Map<string, string>();
  const cases = trial.cases.map(item => {
    if (ids.has(item.id)) throw new Error("Use unique case identifiers.");
    ids.add(item.id);
    if (groups.has(item.group) && groups.get(item.group) !== item.split) {
      throw new Error("Keep each workflow group in one split.");
    }
    groups.set(item.group, item.split);
    const snapshot = parseSnapshot(item.snapshot);
    if (snapshot.episodes.length !== 1) throw new Error("Supply one episode per labeled case.");
    if (item.origin === "observed" && snapshot.evidence !== "user-supplied") {
      throw new Error("Observed cases require user-supplied evidence.");
    }
    return { ...item, snapshot, contract: parseTraceContract(item.contract), baseline: parseTraceContract(item.baseline) };
  });
  return { ...trial, cases };
}

export type Trial = ReturnType<typeof parseTrial>;

export function runTrial(trial: Trial) {
  const cases = trial.cases.map(item => {
    const startBaseline = performance.now();
    const baseline = auditTraceContract({ snapshot: item.snapshot, contract: item.baseline });
    const baselineMs = milliseconds.parse(performance.now() - startBaseline);
    const startAvalon = performance.now();
    const avalon = auditTraceContract({ snapshot: item.snapshot, contract: item.contract });
    const avalonMs = milliseconds.parse(performance.now() - startAvalon);
    return {
      id: item.id, group: item.group, split: item.split, origin: item.origin,
      expected: item.expected, labelEvidence: item.labelEvidence, evidence: item.snapshot.evidence,
      execution: item.execution,
      baseline: { status: baseline.status, latencyMs: baselineMs, contractHash: baseline.contractHash },
      avalon: { status: avalon.status, latencyMs: avalonMs, audit: avalon },
      witness: avalon.status === "mismatch" ? buildTraceWitness({ snapshot: item.snapshot, contract: item.contract }) : null,
    };
  });
  function counts(rows: typeof cases, method: "baseline" | "avalon") {
    const verdict = (row: typeof cases[number]): TraceStatus => row[method].status;
    return {
      samples: rows.length,
      agreements: rows.filter(row => verdict(row) === row.expected).length,
      falseAccepts: rows.filter(row => row.expected === "mismatch" && verdict(row) === "match").length,
      falseRejects: rows.filter(row => row.expected === "match" && verdict(row) === "mismatch").length,
      unknowns: rows.filter(row => verdict(row) === "unknown").length,
      acceptedWithoutEvidence: rows.filter(row => row.expected === "unknown" && verdict(row) === "match").length,
    };
  }
  const comparisons = (["development", "holdout"] as const).flatMap(split =>
    (["observed", "authored-control"] as const).map(origin => {
      const rows = cases.filter(item => item.split === split && item.origin === origin);
      return { split, origin, baseline: counts(rows, "baseline"), avalon: counts(rows, "avalon") };
    }));
  return {
    format: "avalon.trial-report/v1", private: true, trialHash: contentHash(trial),
    protocol: trial.protocol, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    comparisons, cases,
    limits: [
      "The report contains private evidence. Review it before sharing.",
      "The audit stage checks recorded observations. It does not execute actions, reset a sandbox, or train a model.",
      "Authorization, labels, execution costs, and protocol metadata are supplied declarations, not verified facts.",
      "The baseline uses the same checker with simpler rules. It is not an independent implementation.",
      "Each checker has one timing per case. Timings exclude parsing, witness creation, and file output.",
      "Counts describe this sample only. Population uncertainty and timing uncertainty are not estimated.",
      "No model calls occur in the audit stage. Prior execution costs can be unknown.",
      "Group checks prevent declared split overlap. They do not detect hidden duplicates or prior holdout exposure.",
    ],
  };
}
