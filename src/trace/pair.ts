import { z } from "zod";
import { auditSnapshots, contentHash } from "../audit/engine.js";
import type { EpisodeSnapshot, Json, Snapshot } from "../lab/contract.js";
import { traceEpisodeIntegrity, type TraceStatus } from "./audit.js";

const token = z.string().min(1).max(240).refine(value => value !== "__proto__");
const pairSchema = z.object({ sourceEpisode: token, sourceTask: token, targetEpisode: token, targetTask: token }).strict();
export const tracePairContractSchema = z.object({
  format: z.literal("avalon.trace-pair/v1"), name: token,
  pairs: z.array(pairSchema).min(1).max(128),
  renames: z.array(z.object({ from: token, to: token }).strict()).max(128),
}).strict().superRefine((contract, context) => {
  for (const values of [contract.pairs.map(pair => pair.sourceEpisode), contract.pairs.map(pair => pair.targetEpisode),
    contract.renames.map(rename => rename.from), contract.renames.map(rename => rename.to)]) {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "The pair mapping must be one-to-one." });
  }
});
export type TracePairContract = z.infer<typeof tracePairContractSchema>;
export type TracePairAudit = Readonly<{
  format: "avalon.trace-pair-audit/v1"; status: TraceStatus; sourceHash: string; targetHash: string; contractHash: string;
  issues: readonly string[]; pairs: readonly Readonly<{ pair: number; status: TraceStatus; code: string; differences: number }>[];
  limits: readonly string[];
}>;
export function parseTracePairContract(value: unknown): TracePairContract {
  const result = tracePairContractSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented Avalon trace pair format.");
  return result.data;
}

function vocabulary(value: Json, result = new Set<string>()): Set<string> {
  if (typeof value === "string") result.add(value);
  else if (Array.isArray(value)) value.forEach(item => vocabulary(item, result));
  else if (value !== null && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    result.add(key); vocabulary(item, result);
  }
  return result;
}
function renameValue(value: Json, names: ReadonlyMap<string, string>): Json {
  if (typeof value === "string") return names.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => renameValue(item, names));
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [names.get(key) ?? key, renameValue(item, names)]));
  return value;
}
function transformEpisode(episode: EpisodeSnapshot, names: ReadonlyMap<string, string>): EpisodeSnapshot {
  return { ...episode, steps: episode.steps.map(step => ({ ...step,
    observation: renameValue(step.observation, names), action: renameValue(step.action, names),
    next_observation: renameValue(step.next_observation, names),
  })), ...(episode.metadata === undefined ? {} : { metadata: renameValue(episode.metadata, names) as Record<string, Json> }) };
}

export function auditTracePair(options: { source: Snapshot; target: Snapshot; contract: TracePairContract }): TracePairAudit {
  const { source, target, contract } = options;
  const issues: string[] = [];
  if (contract.pairs.length === 0 || contract.pairs.length !== source.episodes.length || contract.pairs.length !== target.episodes.length) {
    issues.push("pair.coverage");
  }
  const names = new Map(contract.renames.map(rename => [rename.from, rename.to]));
  const pairs = contract.pairs.map((pair, index) => {
    const left = source.episodes.filter(episode => episode.id === pair.sourceEpisode && episode.task === pair.sourceTask);
    const right = target.episodes.filter(episode => episode.id === pair.targetEpisode && episode.task === pair.targetTask);
    if (left.length !== 1 || right.length !== 1
      || source.episodes.filter(episode => episode.id === pair.sourceEpisode).length !== 1
      || target.episodes.filter(episode => episode.id === pair.targetEpisode).length !== 1) {
      return { pair: index + 1, status: "unknown" as const, code: "pair.identity", differences: 0 };
    }
    const episode = left[0]!;
    if (traceEpisodeIntegrity(episode) !== "complete" || traceEpisodeIntegrity(right[0]!) !== "complete") {
      return { pair: index + 1, status: "unknown" as const, code: "pair.incomplete", differences: 0 };
    }
    const words = vocabulary({ steps: episode.steps.map(step => ({ observation: step.observation, action: step.action,
      next_observation: step.next_observation })), metadata: episode.metadata ?? {} });
    if (contract.renames.some(rename => words.has(rename.to) && !names.has(rename.to))) {
      return { pair: index + 1, status: "unknown" as const, code: "transform.collision", differences: 0 };
    }
    const expected = transformEpisode(episode, names);
    const report = auditSnapshots({ source: { ...source, episodes: [{ ...expected, id: pair.targetEpisode, task: pair.targetTask }] },
      target: { ...target, episodes: right } });
    const status: TraceStatus = report.status === "pass" ? "match" : report.status === "fail" ? "mismatch" : "unknown";
    return { pair: index + 1, status, code: status === "match" ? "pair.matched" : "pair.changed", differences: report.findings.length };
  });
  return {
    format: "avalon.trace-pair-audit/v1",
    status: pairs.some(pair => pair.status === "mismatch") ? "mismatch"
      : issues.length > 0 || pairs.some(pair => pair.status === "unknown") ? "unknown" : "match",
    sourceHash: contentHash(source), targetHash: contentHash(target), contractHash: contentHash(contract), issues, pairs,
    limits: ["The audit checks declared renaming and full transition preservation. It does not prove task equivalence outside that transformation.",
      "A record renaming is not evidence of generalization to another task family."],
  };
}
