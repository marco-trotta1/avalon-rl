import { z } from "zod";
import { parseTraceContract } from "../trace/contract.js";

const label = z.string().trim().min(1).max(240);
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export const millisecondsSchema = z.number().finite().nonnegative().brand<"Milliseconds">();
export const usdSchema = z.number().finite().nonnegative().brand<"USD">();
export const processSpecSchema = z.object({ executable: label, script: label }).strict();
const caseSchema = z.object({
  id: identifier, group: label, split: z.enum(["development", "holdout"]),
  task: label, seed: z.number().int().nonnegative().max(0xffffffff),
  reset: z.json(), contract: z.unknown(), baseline: z.unknown(),
  policy: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("scripted"), actions: z.array(z.json()).min(1).max(100) }).strict(),
    z.object({ kind: z.literal("agent"), process: processSpecSchema, config: z.json().optional() }).strict(),
  ]),
}).strict();
const sessionSchema = z.object({
  format: z.literal("avalon.session/v1"), id: identifier,
  evidence: z.enum(["synthetic", "user-supplied"]),
  authorization: z.object({ owner: label, reference: label, localUseApproved: z.literal(true) }).strict(),
  protocol: z.object({
    frozenAt: z.iso.datetime(), reviewer: label, baselineName: label,
    dataRevision: label, adapterVersion: label, modelVersion: label,
    setupMinutes: z.number().finite().nonnegative().brand<"Minutes">(),
  }).strict(),
  adapter: processSpecSchema,
  limits: z.object({
    maxSteps: z.number().int().min(1).max(100),
    timeoutMs: z.number().int().min(100).max(60_000).brand<"Milliseconds">(),
    maxOutputBytes: z.number().int().min(1024).max(1024 * 1024).brand<"Bytes">(),
    maxAgentCostUsd: usdSchema,
  }).strict(),
  cases: z.array(caseSchema).min(1).max(100),
}).strict();

export function parseSession(value: unknown) {
  const result = sessionSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented Avalon session format and explicit execution limits.");
  const ids = new Set<string>();
  const groups = new Map<string, string>();
  const cases = result.data.cases.map(item => {
    if (ids.has(item.id)) throw new Error("Use unique session case identifiers.");
    ids.add(item.id);
    if (groups.has(item.group) && groups.get(item.group) !== item.split) throw new Error("Keep each workflow group in one split.");
    groups.set(item.group, item.split);
    if (item.policy.kind === "scripted" && item.policy.actions.length > result.data.limits.maxSteps) {
      throw new Error("The scripted plan exceeds the step limit.");
    }
    return { ...item, contract: parseTraceContract(item.contract), baseline: parseTraceContract(item.baseline) };
  });
  return { ...result.data, cases };
}

export type Session = ReturnType<typeof parseSession>;
export type SessionCase = Session["cases"][number];
export type ProcessSpec = z.infer<typeof processSpecSchema>;

export const observationSchema = z.object({ observation: z.json() }).strict();
export const stepResultSchema = z.object({
  reward: z.number().finite(), terminated: z.boolean(), truncated: z.boolean(),
}).strict();
export const judgmentSchema = z.object({
  status: z.enum(["match", "mismatch", "unknown"]), evidence: z.json(),
  baseline: z.enum(["match", "mismatch", "unknown"]),
  baselineName: label,
}).strict();
export const agentResultSchema = z.object({ action: z.json(), costUsd: usdSchema, metadata: z.json().optional() }).strict();
export const descriptionSchema = z.object({ name: label, version: label, runtime: label }).strict();
