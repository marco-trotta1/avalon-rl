import { z } from "zod";

export const SNAPSHOT_FORMAT = "avalon.snapshot/v1";
export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
export const MAX_SNAPSHOT_STEPS = 20_000;

const label = z.string().trim().min(1).max(240);
const stepIndex = z.number().int().nonnegative().max(MAX_SNAPSHOT_STEPS).brand<"StepIndex">();
const reward = z.number().finite().brand<"Reward">();

export const stepSchema = z.object({
  index: stepIndex,
  observation: z.json(),
  action: z.json(),
  reward,
  next_observation: z.json(),
  terminated: z.boolean(),
  truncated: z.boolean(),
  bootstrap_mask: z.union([z.literal(0), z.literal(1)]).optional(),
}).strict();

export const episodeSnapshotSchema = z.object({
  id: label,
  task: label,
  steps: z.array(stepSchema).min(1).max(MAX_SNAPSHOT_STEPS),
  metadata: z.record(z.string().max(240), z.json()).optional(),
}).strict();

export const snapshotSchema = z.object({
  format: z.literal(SNAPSHOT_FORMAT),
  stage: z.enum(["source", "recorded", "learner"]),
  producer: z.object({ name: label, version: label }).strict(),
  seed: z.number().int().nonnegative().max(0xffffffff),
  evidence: z.enum(["synthetic", "user-supplied"]),
  episodes: z.array(episodeSnapshotSchema).min(1).max(MAX_SNAPSHOT_STEPS),
}).strict().superRefine((snapshot, context) => {
  const steps = snapshot.episodes.reduce((sum, episode) => sum + episode.steps.length, 0);
  if (steps > MAX_SNAPSHOT_STEPS) {
    context.addIssue({ code: "custom", message: "The snapshot exceeds 20,000 transitions." });
  }
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type EpisodeSnapshot = z.infer<typeof episodeSnapshotSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Json = z.infer<ReturnType<typeof z.json>>;
export type Reward = Step["reward"];
export type StepIndex = Step["index"];

export function parseSnapshot(value: unknown): Snapshot {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item !== "object" || item === null || seen.has(item)) continue;
    seen.add(item);
    if (Object.hasOwn(item, "__proto__")) {
      throw new Error("The input contains an unsupported JSON property.");
    }
    for (const child of Object.values(item)) pending.push(child);
  }
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented Avalon snapshot format.");
  return result.data;
}

export function parseSnapshotText(text: string): Snapshot {
  if (Buffer.byteLength(text, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new Error("The snapshot exceeds 10 MiB.");
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("The snapshot must contain valid JSON."); }
  return parseSnapshot(value);
}
