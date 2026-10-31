import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { COMMAND_NAMES, type AgentCommandName } from "./catalog.js";
import { digest, ensureDirectory, fingerprint, inspectPath, readJson, writeJson } from "./io.js";
import { discoverProject, fingerprintSchema, initProjectUnlocked } from "./project.js";

const bindingsSchema = z.strictObject({
  metadata: z.array(fingerprintSchema).max(100), inputs: z.array(fingerprintSchema).max(100),
});
const runSchema = z.strictObject({
  format: z.literal("avalon-agent-run-v1"), runId: z.string().uuid(), projectId: z.string().regex(/^[a-f0-9]{64}$/),
  command: z.enum(COMMAND_NAMES), goal: z.string().trim().min(1).max(16000), createdAt: z.string().datetime(),
  status: z.literal("planned"), bindings: bindingsSchema,
});
const eventSchema = z.strictObject({
  format: z.literal("avalon-agent-event-v1"), sequence: z.number().int().positive(),
  previous: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
  kind: z.enum(["observation", "hypothesis", "evidence", "decision"]), message: z.string().trim().min(1).max(16000),
  artifact: fingerprintSchema.optional(), bindings: bindingsSchema.optional(),
}).superRefine((event, context) => {
  if (event.kind === "evidence" && event.artifact === undefined) context.addIssue({ code: "custom", message: "Evidence requires an artifact." });
  if (event.kind === "evidence" && event.artifact?.bytes === 0) context.addIssue({ code: "custom", message: "Evidence requires a nonempty artifact." });
  if (event.bindings !== undefined && event.kind !== "decision") context.addIssue({ code: "custom", message: "Only decisions accept changes." });
});
const resultSchema = z.strictObject({
  format: z.literal("avalon-agent-result-v1"), runId: z.string().uuid(),
  status: z.enum(["complete", "inconclusive", "blocked", "failed"]), summary: z.string().trim().min(1).max(16000),
  finishedAt: z.string().datetime(), lastEvent: z.string().regex(/^[a-f0-9]{64}$/), events: z.number().int().nonnegative(),
  evidenceBasis: z.literal("host-supplied artifact records"),
});

type Bindings = z.infer<typeof bindingsSchema>;
type Run = z.infer<typeof runSchema>;
type Event = z.infer<typeof eventSchema>;
type Result = z.infer<typeof resultSchema>;
export type RecordKind = Event["kind"];
export type FinishStatus = Result["status"];

function runPath(id: string): string {
  if (!z.string().uuid().safeParse(id).success) throw new Error("Use the run identifier returned by start.");
  return `.avalon/runs/${id}`;
}

function parseRecord<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("The agent record has an invalid format.");
  return parsed.data;
}

async function bindings(root: string, inputs: readonly string[]): Promise<Bindings> {
  const metadata = (await discoverProject(root)).metadata;
  const fingerprints = await Promise.all(inputs.map(path => fingerprint(root, path)));
  fingerprints.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(fingerprints.map(value => value.path)).size !== fingerprints.length) throw new Error("Declare each input only once.");
  return { metadata, inputs: fingerprints };
}

async function checkBindings(root: string, current: Bindings): Promise<void> {
  const fresh = await bindings(root, current.inputs.map(file => file.path));
  if (JSON.stringify(current) !== JSON.stringify(fresh)) {
    throw new Error("The bound project files change. Record an intentional decision with --accept-drift before continuing.");
  }
}

async function load(root: string, id: string, { acceptDrift = false }: { acceptDrift?: boolean } = {}) {
  const path = runPath(id);
  const run = parseRecord(runSchema, await readJson(root, `${path}/manifest.json`));
  if (run.runId !== id || run.projectId !== digest(root)) throw new Error("The run belongs to another project.");
  const eventDirectory = `${path}/events`;
  const directory = await inspectPath(root, eventDirectory);
  if (!directory.exists) throw new Error("The run event directory is missing.");
  const names = (await readdir(directory.absolute)).sort();
  if (names.length > 10000) throw new Error("The run exceeds the event limit.");
  const events: Event[] = [];
  let tip = digest(JSON.stringify(run));
  let currentBindings = run.bindings;
  let evidenceAfterChange = false;
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index + 1).padStart(6, "0")}.json`) throw new Error("The run events have a gap or an unexpected file.");
    const event = parseRecord(eventSchema, await readJson(root, `${eventDirectory}/${name}`));
    if (event.sequence !== index + 1 || event.previous !== tip) throw new Error("The run event chain changes.");
    if (event.artifact !== undefined) {
      const fresh = await fingerprint(root, event.artifact.path);
      if (JSON.stringify(fresh) !== JSON.stringify(event.artifact)) throw new Error("A recorded artifact changes. Preserve the original evidence.");
    }
    if (event.bindings !== undefined) {
      currentBindings = event.bindings;
      evidenceAfterChange = false;
    }
    if (event.kind === "evidence") evidenceAfterChange = true;
    tip = digest(JSON.stringify(event));
    events.push(event);
  }
  let result: Result | undefined;
  if ((await inspectPath(root, `${path}/result.json`)).exists) {
    result = parseRecord(resultSchema, await readJson(root, `${path}/result.json`));
    if (result.runId !== id || result.lastEvent !== tip || result.events !== events.length) throw new Error("The terminal run record changes.");
    if (result.status === "complete" && !evidenceAfterChange) throw new Error("A complete run lacks fresh artifact evidence.");
  }
  if (!acceptDrift) await checkBindings(root, currentBindings);
  return { run, path, events, tip, bindings: currentBindings, evidenceAfterChange, result };
}

export async function startRun(root: string, input: { command: AgentCommandName; goal: string; inputs: string[] }) {
  const goal = z.string().trim().min(1).max(16000).safeParse(input.goal);
  if (!goal.success) throw new Error("Supply a goal between 1 and 16000 characters.");
  if (input.inputs.length > 100) throw new Error("Declare no more than 100 input files.");
  const currentBindings = await bindings(root, input.inputs);
  await initProjectUnlocked(root);
  const run: Run = {
    format: "avalon-agent-run-v1", runId: randomUUID(), projectId: digest(root), command: input.command,
    goal: goal.data, createdAt: new Date().toISOString(), status: "planned", bindings: currentBindings,
  };
  const path = runPath(run.runId);
  await ensureDirectory(root, `${path}/events`);
  await writeJson(root, `${path}/manifest.json`, run);
  return { ...run, directory: path, next: "The host executes the workflow. Starting the run does not execute checks or training." };
}

export async function recordRun(root: string, input: {
  id: string; kind: RecordKind; message: string; artifact?: string; acceptDrift: boolean;
}) {
  if (input.acceptDrift && input.kind !== "decision") throw new Error("Use --accept-drift only with a decision record.");
  const state = await load(root, input.id, { acceptDrift: input.acceptDrift });
  if (state.result !== undefined) throw new Error("The run is terminal. Start a new run for further work.");
  if (state.events.length >= 10000) throw new Error("The run reaches the event limit.");
  const event = parseRecord(eventSchema, {
    format: "avalon-agent-event-v1", sequence: state.events.length + 1, previous: state.tip,
    createdAt: new Date().toISOString(), kind: input.kind, message: input.message,
    ...(input.artifact === undefined ? {} : { artifact: await fingerprint(root, input.artifact) }),
    ...(input.acceptDrift ? { bindings: await bindings(root, state.bindings.inputs.map(file => file.path)) } : {}),
  });
  const filename = `${state.path}/events/${String(event.sequence).padStart(6, "0")}.json`;
  await writeJson(root, filename, event);
  return { runId: input.id, event, record: filename, evidenceBasis: "The host supplies evidence. An artifact hash establishes byte identity, not the truth of a claim." };
}

export async function finishRun(root: string, input: { id: string; status: FinishStatus; summary: string }) {
  const state = await load(root, input.id);
  if (state.result !== undefined) throw new Error("The run is terminal. Existing results are preserved.");
  if (input.status === "complete" && !state.evidenceAfterChange) throw new Error("Record fresh artifact-backed evidence before completing the run.");
  const result = parseRecord(resultSchema, {
    format: "avalon-agent-result-v1", runId: input.id, status: input.status, summary: input.summary,
    finishedAt: new Date().toISOString(), lastEvent: state.tip, events: state.events.length,
    evidenceBasis: "host-supplied artifact records",
  });
  await writeJson(root, `${state.path}/result.json`, result);
  return result;
}

export async function resumeRun(root: string, id: string) {
  const state = await load(root, id);
  return {
    manifest: state.run, records: state.events, status: state.result?.status ?? (state.events.length ? "active" : "planned"),
    result: state.result ?? null, currentBindings: state.bindings,
    next: state.result === undefined ? "Resume the host workflow from the recorded evidence." : "The terminal result is immutable. Start another run for new work.",
  };
}
