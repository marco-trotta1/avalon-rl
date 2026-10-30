import { createHash } from "node:crypto";
import type { Json, Snapshot } from "../lab/contract.js";

export interface AuditPolicy {
  absoluteTolerance: number;
  relativeTolerance: number;
}

export interface AuditFinding {
  code: string;
  severity: "error" | "warning" | "unknown";
  episode?: number;
  step?: number;
  field?: string;
  message: string;
  expectedHash?: string;
  actualHash?: string;
}

export interface AuditReport {
  format: "avalon.audit/v1";
  status: "pass" | "fail" | "inconclusive";
  source: { sha256: string; stage: Snapshot["stage"]; producer: Snapshot["producer"] };
  target: { sha256: string; stage: Snapshot["stage"]; producer: Snapshot["producer"] };
  summary: { sourceEpisodes: number; targetEpisodes: number; comparedSteps: number; errors: number; warnings: number; unknowns: number };
  findings: AuditFinding[];
  policy: AuditPolicy;
  evidence: Snapshot["evidence"];
  limits: string[];
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("Use finite JSON values for audit evidence.");
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function resolvePolicy(policy?: AuditPolicy): AuditPolicy {
  const resolved = policy ?? { absoluteTolerance: 0, relativeTolerance: 0 };
  if (![resolved.absoluteTolerance, resolved.relativeTolerance].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error("Use finite nonnegative audit tolerances.");
  }
  return { ...resolved };
}

export function valuesEqual({ expected, actual, policy }: {
  expected: Json;
  actual: Json;
  policy: AuditPolicy;
}): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    const difference = Math.abs(expected - actual);
    const scale = Math.max(Math.abs(expected), Math.abs(actual));
    return difference <= policy.absoluteTolerance + policy.relativeTolerance * scale;
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => {
      const other = actual[index];
      return other !== undefined && valuesEqual({ expected: value, actual: other, policy });
    });
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const keys = Object.keys(expected);
    return keys.length === Object.keys(actual).length && keys.every(key => {
      const value = expected[key];
      const other = actual[key];
      return value !== undefined && other !== undefined && Object.hasOwn(actual, key) && valuesEqual({ expected: value, actual: other, policy });
    });
  }
  return expected === actual;
}

export function auditSnapshots({ source, target, policy: inputPolicy }: {
  source: Snapshot;
  target: Snapshot;
  policy?: AuditPolicy;
}): AuditReport {
  const policy = resolvePolicy(inputPolicy);
  const findings: AuditFinding[] = [];
  let comparedSteps = 0;
  source.episodes.forEach((episode, offset) => {
    const other = target.episodes.find(candidate => candidate.id === episode.id);
    if (!other) {
      findings.push({ code: "episode.missing", severity: "error", episode: offset + 1, message: "The target omits a source episode." });
      return;
    }
    for (const step of episode.steps) {
      const candidate = other.steps.find(item => item.index === step.index);
      if (!candidate) {
        findings.push({ code: "step.missing", severity: "error", episode: offset + 1, step: step.index, message: "The target omits a source transition." });
        continue;
      }
      comparedSteps += 1;
      for (const field of ["observation", "action", "reward", "next_observation", "terminated", "truncated", "bootstrap_mask"] as const) {
        const expectedHash = contentHash(step[field] ?? null);
        const actualHash = contentHash(candidate[field] ?? null);
        if (!valuesEqual({ expected: step[field] ?? null, actual: candidate[field] ?? null, policy })) findings.push({ code: "transition.changed", severity: "error", episode: offset + 1, step: step.index, field, message: "The target changes a transition field.", expectedHash, actualHash });
      }
    }
  });
  const errors = findings.filter(finding => finding.severity === "error").length;
  const warnings = findings.filter(finding => finding.severity === "warning").length;
  const unknowns = findings.filter(finding => finding.severity === "unknown").length;
  return {
    format: "avalon.audit/v1",
    status: errors > 0 ? "fail" : unknowns > 0 ? "inconclusive" : "pass",
    source: { sha256: contentHash(source), stage: source.stage, producer: { ...source.producer } },
    target: { sha256: contentHash(target), stage: target.stage, producer: { ...target.producer } },
    summary: { sourceEpisodes: source.episodes.length, targetEpisodes: target.episodes.length, comparedSteps, errors, warnings, unknowns },
    findings,
    policy,
    evidence: source.evidence === "synthetic" && target.evidence === "synthetic" ? "synthetic" : "user-supplied",
    limits: ["The audit compares supplied evidence. It does not establish task success or external validity."],
  };
}
