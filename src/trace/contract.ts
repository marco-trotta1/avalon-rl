import { z } from "zod";
import type { Json } from "../lab/contract.js";

const label = z.string().trim().min(1).max(120);
const pathPart = z.union([z.string().min(1).max(120), z.number().int().nonnegative().max(20_000)]);
export const tracePathSchema = z.array(pathPart).max(16).brand<"TracePath">();
const tolerance = z.number().finite().nonnegative().max(1e12).brand<"TraceTolerance">();
export const traceToleranceSchema = z.object({ absolute: tolerance, relative: tolerance }).strict();
const finalEquals = z.object({
  id: label, kind: z.literal("final-equals"), path: tracePathSchema,
  expected: z.json(), tolerance: traceToleranceSchema.optional(),
}).strict();
const preserve = z.object({
  id: label, kind: z.literal("preserve"), path: tracePathSchema,
  scope: z.enum(["final", "every-step"]), tolerance: traceToleranceSchema.optional(),
}).strict();
const allowlist = z.object({
  id: label, kind: z.literal("action-allowlist"),
  when: z.object({ path: tracePathSchema, equals: z.json() }).strict(),
  path: tracePathSchema, allowed: z.array(z.json()).min(1).max(128),
}).strict();
export const traceContractSchema = z.object({
  format: z.literal("avalon.trace-contract/v1"), name: label,
  rules: z.array(z.discriminatedUnion("kind", [finalEquals, preserve, allowlist])).min(1).max(128),
}).strict().superRefine((contract, context) => {
  const ids = contract.rules.map(rule => rule.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "The rule identifiers must be unique." });
});
export type TracePath = z.infer<typeof tracePathSchema>;
export type TraceTolerance = z.infer<typeof traceToleranceSchema>;
export type TraceContract = z.infer<typeof traceContractSchema>;
export type TraceRule = TraceContract["rules"][number];
export type PathEvidence = Readonly<{ status: "present"; value: Json }> | Readonly<{ status: "missing" }>;

export function parseTraceContract(value: unknown): TraceContract {
  const result = traceContractSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented Avalon trace contract format.");
  return result.data;
}

export function resolveTracePath(options: { value: Json; path: TracePath }): PathEvidence {
  let current = options.value;
  for (const part of options.path) {
    if (typeof part === "number") {
      if (!Array.isArray(current) || part >= current.length) return { status: "missing" };
      current = current[part]!;
    } else {
      if (current === null || typeof current !== "object" || Array.isArray(current)
        || !Object.hasOwn(current, part)) return { status: "missing" };
      current = current[part]!;
    }
  }
  return { status: "present", value: current };
}
