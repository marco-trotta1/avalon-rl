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

function uniqueByKey<T, K extends string | number>({ items, key, duplicate }: {
  items: T[];
  key: (item: T) => K;
  duplicate: (item: T, offset: number) => void;
}): Map<K, { value: T; offset: number }> {
  const groups = new Map<K, { value: T; offset: number }[]>();
  items.forEach((value, offset) => {
    const id = key(value);
    const group = groups.get(id) ?? [];
    group.push({ value, offset });
    groups.set(id, group);
  });
  const unique = new Map<K, { value: T; offset: number }>();
  for (const [id, group] of groups) {
    const first = group[0];
    if (!first) continue;
    if (group.length > 1) duplicate(first.value, first.offset);
    else unique.set(id, first);
  }
  return unique;
}

export function auditSnapshots({ source, target, policy: inputPolicy }: {
  source: Snapshot;
  target: Snapshot;
  policy?: AuditPolicy;
}): AuditReport {
  const policy = resolvePolicy(inputPolicy);
  const findings: AuditFinding[] = [];
  let comparedSteps = 0;
  const sourceEpisodes = uniqueByKey({ items: source.episodes, key: episode => episode.id, duplicate: (_episode, offset) => {
    findings.push({ code: "source.episode.duplicate", severity: "error", episode: offset + 1, message: "The source repeats an episode key." });
  } });
  const targetEpisodes = uniqueByKey({ items: target.episodes, key: episode => episode.id, duplicate: () => {
    findings.push({ code: "target.episode.duplicate", severity: "error", message: "The target repeats an episode key." });
  } });
  for (const [side, snapshot] of [["source", source], ["target", target]] as const) {
    snapshot.episodes.forEach((episode, offset) => {
      const sourceOffset = side === "source" ? offset : sourceEpisodes.get(episode.id)?.offset;
      for (const step of episode.steps) {
        const location = { ...(sourceOffset === undefined ? {} : { episode: sourceOffset + 1 }), step: step.index, field: "bootstrap_mask" };
        if (step.bootstrap_mask === undefined) {
          if (snapshot.stage === "learner") findings.push({ code: `${side}.bootstrap.unknown`, severity: "unknown", ...location, message: "The learner evidence omits the bootstrap mask." });
        } else if (step.bootstrap_mask !== (step.terminated ? 0 : 1)) {
          findings.push({ code: `${side}.bootstrap.invalid`, severity: "error", ...location, message: "The bootstrap mask conflicts with the termination signal." });
        }
      }
      uniqueByKey({ items: episode.steps, key: step => step.index, duplicate: step => {
        findings.push({ code: `${side}.step.duplicate`, severity: "error", ...(sourceOffset === undefined ? {} : { episode: sourceOffset + 1 }), step: step.index, message: "The snapshot repeats a transition index." });
      } });
    });
  }
  for (const [id, { value: episode, offset }] of sourceEpisodes) {
    const matched = targetEpisodes.get(id);
    if (!matched) {
      findings.push({ code: "episode.missing", severity: "error", episode: offset + 1, message: "The target omits an unambiguous source episode." });
      continue;
    }
    const other = matched.value;
    if (offset !== matched.offset) findings.push({ code: "episode.reordered", severity: "warning", episode: offset + 1, message: "The target changes the episode position." });
    const sourceSteps = uniqueByKey({ items: episode.steps, key: step => step.index, duplicate: () => {} });
    const targetSteps = uniqueByKey({ items: other.steps, key: step => step.index, duplicate: () => {} });
    for (const [index, { value: step, offset: stepOffset }] of sourceSteps) {
      const matchedStep = targetSteps.get(index);
      if (!matchedStep) {
        findings.push({ code: "step.missing", severity: "error", episode: offset + 1, step: index, message: "The target omits an unambiguous source transition." });
        continue;
      }
      const candidate = matchedStep.value;
      if (stepOffset !== matchedStep.offset) findings.push({ code: "step.reordered", severity: "error", episode: offset + 1, step: index, message: "The target changes the transition position." });
      comparedSteps += 1;
      if (step.bootstrap_mask !== undefined && candidate.bootstrap_mask === undefined) {
        findings.push({ code: "bootstrap.removed", severity: "error", episode: offset + 1, step: index, field: "bootstrap_mask", message: "The target removes a supplied bootstrap mask.", expectedHash: contentHash({ present: true, value: step.bootstrap_mask }), actualHash: contentHash({ present: false }) });
      }
      for (const field of ["observation", "action", "reward", "next_observation", "terminated", "truncated"] as const) {
        const expectedHash = contentHash(step[field] ?? null);
        const actualHash = contentHash(candidate[field] ?? null);
        if (!valuesEqual({ expected: step[field] ?? null, actual: candidate[field] ?? null, policy })) findings.push({ code: "transition.changed", severity: "error", episode: offset + 1, step: index, field, message: "The target changes a transition field.", expectedHash, actualHash });
      }
    }
    for (const index of targetSteps.keys()) {
      if (!episode.steps.some(step => step.index === index)) findings.push({ code: "step.extra", severity: "error", episode: offset + 1, step: index, message: "The target adds a transition index." });
    }
  }
  for (const id of targetEpisodes.keys()) {
    if (!source.episodes.some(episode => episode.id === id)) findings.push({ code: "episode.extra", severity: "error", message: "The target adds an episode key." });
  }
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
