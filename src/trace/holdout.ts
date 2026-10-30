import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import type { TraceStatus } from "./audit.js";

const label = z.string().trim().min(1).max(240);
const axis = z.enum(["taskFamily", "mutationFamily", "instanceGroup", "sha256"]);
export const traceHoldoutSchema = z.object({
  format: z.literal("avalon.trace-holdout/v1"), name: label,
  disjointBy: z.array(axis).min(1).max(4),
  records: z.array(z.object({
    id: label, partition: z.enum(["train", "eval"]), taskFamily: label, mutationFamily: label,
    instanceGroup: label, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(20_000),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.records.map(record => record.id)).size !== manifest.records.length
    || new Set(manifest.disjointBy).size !== manifest.disjointBy.length) {
    context.addIssue({ code: "custom", message: "The records and grouping axes must be unique." });
  }
});
export type TraceHoldout = z.infer<typeof traceHoldoutSchema>;
export type TraceHoldoutAudit = Readonly<{
  format: "avalon.trace-holdout-audit/v1"; status: TraceStatus; manifestHash: string;
  summary: Readonly<{ train: number; eval: number }>; issues: readonly string[];
  overlaps: readonly Readonly<{ axis: z.infer<typeof axis>; groupHash: string; train: number; eval: number }>[];
  limits: readonly string[];
}>;
export function parseTraceHoldout(value: unknown): TraceHoldout {
  const result = traceHoldoutSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented Avalon trace holdout format.");
  return result.data;
}
export function auditTraceHoldout(options: { manifest: TraceHoldout }): TraceHoldoutAudit {
  const { manifest } = options;
  const summary = { train: manifest.records.filter(record => record.partition === "train").length,
    eval: manifest.records.filter(record => record.partition === "eval").length };
  const issues = summary.train === 0 || summary.eval === 0 ? ["partition.missing"] : [];
  const overlaps: { axis: z.infer<typeof axis>; groupHash: string; train: number; eval: number }[] = [];
  const axes = new Set([...manifest.disjointBy, "sha256" as const]);
  for (const grouping of axes) {
    const groups = new Map<string, { train: number; eval: number }>();
    for (const record of manifest.records) {
      const counts = groups.get(record[grouping]) ?? { train: 0, eval: 0 };
      counts[record.partition] += 1;
      groups.set(record[grouping], counts);
    }
    for (const [group, counts] of groups) if (counts.train > 0 && counts.eval > 0) {
      overlaps.push({ axis: grouping, groupHash: contentHash(group), ...counts });
    }
  }
  return {
    format: "avalon.trace-holdout-audit/v1", status: overlaps.length > 0 ? "mismatch" : issues.length > 0 ? "unknown" : "match",
    manifestHash: contentHash(manifest), summary, issues, overlaps,
    limits: ["The audit compares declared groups and supplied artifact hashes. It does not inspect the underlying artifacts.",
      "The manifest hash records content. It does not prove that the holdout was frozen before evaluation."],
  };
}
