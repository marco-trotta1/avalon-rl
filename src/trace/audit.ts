import { contentHash, valuesEqual } from "../audit/engine.js";
import type { EpisodeSnapshot, Json, Snapshot } from "../lab/contract.js";
import { resolveTracePath, type TraceContract, type TraceRule, type TraceTolerance } from "./contract.js";

export type TraceStatus = "match" | "mismatch" | "unknown";
export type TraceCheck = Readonly<{
  episode: number; episodeHash: string; ruleId: string; status: TraceStatus; code: string;
  step?: number; expectedHash?: string; actualHash?: string;
}>;
export type TraceAudit = Readonly<{
  format: "avalon.trace-audit/v1"; status: TraceStatus; snapshotHash: string; contractHash: string;
  checks: readonly TraceCheck[];
  summary: Readonly<{ episodes: number; matches: number; mismatches: number; unknowns: number; rewardedMismatches: number }>;
  limits: readonly string[];
}>;

export function traceValuesEqual(options: { expected: Json; actual: Json; tolerance?: TraceTolerance }): boolean {
  return valuesEqual({ expected: options.expected, actual: options.actual, policy: {
    absoluteTolerance: options.tolerance?.absolute ?? 0, relativeTolerance: options.tolerance?.relative ?? 0,
  } });
}

function traceIntegrity(episode: EpisodeSnapshot): "complete" | "incomplete" | "invalid" {
  const first = episode.steps[0];
  const last = episode.steps.at(-1);
  if (!first || !last) return "incomplete";
  let incomplete = first.index !== 0 || (!last.terminated && !last.truncated);
  for (let index = 1; index < episode.steps.length; index++) {
    const previous = episode.steps[index - 1]!;
    const current = episode.steps[index]!;
    if (previous.terminated || previous.truncated || current.index <= previous.index) return "invalid";
    if (current.index > previous.index + 1) incomplete = true;
    else if (!traceValuesEqual({ expected: previous.next_observation, actual: current.observation })) return "invalid";
  }
  return incomplete ? "incomplete" : "complete";
}

function finalRule(options: { episode: EpisodeSnapshot; rule: TraceRule }): Omit<TraceCheck, "episode" | "episodeHash" | "ruleId"> {
  const { episode, rule } = options;
  const final = episode.steps.at(-1)!.next_observation;
  switch (rule.kind) {
    case "final-equals": {
      const actual = resolveTracePath({ value: final, path: rule.path });
      if (actual.status === "missing") return { status: "unknown", code: "evidence.missing" };
      const matches = traceValuesEqual({ expected: rule.expected, actual: actual.value, tolerance: rule.tolerance });
      return { status: matches ? "match" : "mismatch", code: matches ? "outcome.matched" : "outcome.changed",
        expectedHash: contentHash(rule.expected), actualHash: contentHash(actual.value) };
    }
    case "preserve": {
      if (rule.scope !== "final") return { status: "unknown", code: "rule.unsupported" };
      const before = resolveTracePath({ value: episode.steps[0]!.observation, path: rule.path });
      const after = resolveTracePath({ value: final, path: rule.path });
      if (before.status === "missing" || after.status === "missing") return { status: "unknown", code: "evidence.missing" };
      const matches = traceValuesEqual({ expected: before.value, actual: after.value, tolerance: rule.tolerance });
      return { status: matches ? "match" : "mismatch", code: matches ? "frame.matched" : "frame.changed",
        expectedHash: contentHash(before.value), actualHash: contentHash(after.value) };
    }
    case "action-allowlist": return { status: "unknown", code: "rule.unsupported" };
    default: { const exhaustive: never = rule; return exhaustive; }
  }
}

export function auditTraceContract(options: { snapshot: Snapshot; contract: TraceContract }): TraceAudit {
  const { snapshot, contract } = options;
  const checks: TraceCheck[] = [];
  const counts = new Map<string, number>();
  for (const episode of snapshot.episodes) counts.set(episode.id, (counts.get(episode.id) ?? 0) + 1);
  snapshot.episodes.forEach((episode, offset) => {
    const integrity = traceIntegrity(episode);
    for (const rule of contract.rules) {
      const location = { episode: offset + 1, episodeHash: contentHash({ id: episode.id, task: episode.task }), ruleId: rule.id };
      if (counts.get(episode.id) !== 1) checks.push({ ...location, status: "unknown", code: "episode.ambiguous" });
      else if (integrity !== "complete") checks.push({ ...location, status: "unknown", code: `trace.${integrity}` });
      else checks.push({ ...location, ...finalRule({ episode, rule }) });
    }
  });
  const mismatches = checks.filter(check => check.status === "mismatch").length;
  const unknowns = checks.filter(check => check.status === "unknown").length;
  return {
    format: "avalon.trace-audit/v1", status: mismatches > 0 ? "mismatch" : unknowns > 0 ? "unknown" : "match",
    snapshotHash: contentHash(snapshot), contractHash: contentHash(contract), checks,
    summary: {
      episodes: snapshot.episodes.length, matches: checks.filter(check => check.status === "match").length, mismatches, unknowns,
      rewardedMismatches: snapshot.episodes.filter((episode, index) => episode.steps.some(step => step.reward > 0)
        && checks.some(check => check.episode === index + 1 && check.status === "mismatch")).length,
    },
    limits: ["The audit applies supplied rules to supplied evidence. It does not certify the rules or an external outcome.",
      "Positive episode reward and a rule mismatch establish a recorded disagreement, not a causal explanation."],
  };
}
