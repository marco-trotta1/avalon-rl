import { z } from "zod";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS = 20_000;
export const MODEL_VERSION = "comparable-median-v1";
export const REVIEW_DATE = "2026-10-27";

const label = z.string().trim().min(1).max(240);
const reference = z.string().trim().min(1).max(500);
const count = z.number().int().positive().max(10_000_000).brand<"UnitCount">();
const usd = z.number().finite().positive().max(1_000_000_000).brand<"Usd">();
const date = z.iso.date();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const rightsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nonexclusive"), termMonths: z.number().int().min(1).max(120).nullable() }).strict(),
  z.object({ type: z.literal("exclusive"), termMonths: z.number().int().min(1).max(120).nullable() }).strict(),
  z.object({ type: z.literal("assignment") }).strict(),
]);

const documentation = z.discriminatedUnion("status", [
  z.object({ status: z.literal("documented"), reference }).strict(),
  z.object({ status: z.literal("unknown") }).strict(),
  z.object({ status: z.literal("restricted") }).strict(),
]);

const scope = {
  kind: z.enum(["traces", "environment"]),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  modality: z.enum(["tool-use", "text", "robotics", "simulation", "browser"]),
  use: z.enum(["training", "evaluation", "training-and-evaluation"]),
  rights: rightsSchema,
};

export const assetSchema = z.object({
  name: label,
  ...scope,
  provenance: documentation,
  transferRights: documentation,
}).strict();

export const comparableSchema = z.object({
  id: label,
  ...scope,
  currency: z.literal("USD"),
  units: count,
  totalUsd: usd,
  date,
  counterpartyGroup: label,
  evidence: z.object({
    type: z.enum(["closed-contract", "paid-invoice", "asking-price", "quote"]),
    reference,
    documentSha256: sha256,
    reviewer: label,
    reviewedOn: date,
  }).strict(),
}).strict();

export const caseSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceMode: z.enum(["synthetic", "user-supplied"]),
  asOfDate: date,
  asset: assetSchema,
  comparables: z.array(comparableSchema).max(2_000),
}).strict();

const presentJson = z.json().refine(value => value !== null, "Supply a non-null value.");

export const episodeSchema = z.object({
  episode_id: label,
  task_id: label,
  observations: z.array(presentJson).min(2).max(10_001),
  actions: z.array(presentJson).min(1).max(10_000),
  rewards: z.array(z.number().finite()).min(1).max(10_000),
  terminations: z.array(z.boolean()).min(1).max(10_000),
  truncations: z.array(z.boolean()).min(1).max(10_000),
}).strict().superRefine((episode, context) => {
  const length = episode.actions.length;
  if (episode.observations.length !== length + 1 ||
      episode.rewards.length !== length || episode.terminations.length !== length ||
      episode.truncations.length !== length) {
    context.addIssue({ code: "custom", message: "Align the episode arrays. Include the initial and final observations." });
  }
  for (let index = 0; index < length - 1; index++) {
    if (episode.terminations[index] || episode.truncations[index]) {
      context.addIssue({ code: "custom", message: "End the episode at the first termination or truncation." });
      break;
    }
  }
});

export const taskSchema = z.object({
  id: label,
  instruction: z.string().trim().min(1).max(50_000),
  initial_state: presentJson,
  reset: z.string().trim().min(1).max(10_000),
  verifier: z.object({
    type: z.enum(["programmatic", "rubric"]),
    definition: z.string().trim().min(1).max(50_000),
  }).strict(),
  test_receipt: z.object({
    passed: z.number().int().nonnegative().max(1_000_000),
    total: z.number().int().positive().max(1_000_000),
    documentSha256: sha256,
  }).strict().refine(value => value.passed <= value.total, "The passed count exceeds the total count.").optional(),
}).strict();

export const environmentSchema = z.object({
  schemaVersion: z.literal(1),
  environment_id: label,
  version: label,
  tasks: z.array(z.unknown()).min(1).max(MAX_RECORDS),
}).strict();

export type Rights = z.infer<typeof rightsSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Comparable = z.infer<typeof comparableSchema>;
export type AppraisalCase = z.infer<typeof caseSchema>;
export type Episode = z.infer<typeof episodeSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Usd = z.infer<typeof usd>;
export type UnitCount = z.infer<typeof count>;

export function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${String(value)}`);
}

export function rightsLabel(rights: Rights): string {
  switch (rights.type) {
    case "assignment": return "Full ownership sale";
    case "exclusive": return `Exclusive license, ${rights.termMonths === null ? "perpetual" : `${rights.termMonths} months`}`;
    case "nonexclusive": return `Non-exclusive license, ${rights.termMonths === null ? "perpetual" : `${rights.termMonths} months`}`;
    default: return assertNever(rights);
  }
}

export function parseCase(text: string): AppraisalCase {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new Error("The appraisal file exceeds 10 MiB.");
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("The appraisal file must contain valid JSON."); }
  const result = caseSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Check the appraisal field: ${issue?.path.join(".") || "root"}. Use the documented format.`);
  }
  return result.data;
}
