import { randomUUID } from "node:crypto";
import { lstat, opendir } from "node:fs/promises";
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
const eventFields = {
  format: z.literal("avalon-agent-event-v1"), sequence: z.number().int().positive(),
  previous: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
};
const eventMessage = z.string().trim().min(1).max(16000);
const eventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...eventFields, kind: z.literal("observation"), message: eventMessage,
    artifact: fingerprintSchema.optional(), bindings: z.never().optional(),
  }),
  z.strictObject({
    ...eventFields, kind: z.literal("hypothesis"), message: eventMessage,
    artifact: fingerprintSchema.optional(), bindings: z.never().optional(),
  }),
  z.strictObject({
    ...eventFields, kind: z.literal("evidence"), message: eventMessage,
    artifact: fingerprintSchema.extend({ bytes: z.number().int().positive() }), bindings: z.never().optional(),
  }),
  z.strictObject({
    ...eventFields, kind: z.literal("decision"), message: eventMessage,
    artifact: fingerprintSchema.optional(), bindings: bindingsSchema.optional(),
  }),
]);
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

class RunRecordError extends Error {
  constructor(readonly integrity: "invalid" | "tampered", message: string) { super(message); }
}

function runPath(id: string): string {
  if (!z.string().uuid().safeParse(id).success) throw new Error("Use the run identifier returned by start.");
  return `.avalon/runs/${id}`;
}

function parseRecord<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RunRecordError("invalid", "The agent record has an invalid format.");
  return parsed.data;
}

async function bindings(root: string, inputs: readonly string[]): Promise<Bindings> {
  const metadata = (await discoverProject(root)).metadata;
  const fingerprints = await Promise.all(inputs.map(path => fingerprint(root, path)));
  fingerprints.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(fingerprints.map(value => value.path)).size !== fingerprints.length) throw new Error("Declare each input only once.");
  return { metadata, inputs: fingerprints };
}

async function bindingsChanged(root: string, current: Bindings): Promise<boolean> {
  const fresh = await bindings(root, current.inputs.map(file => file.path));
  return JSON.stringify(current) !== JSON.stringify(fresh);
}

async function checkBindings(root: string, current: Bindings): Promise<void> {
  if (await bindingsChanged(root, current)) {
    throw new Error("The bound project files change. Record an intentional decision with --accept-drift before continuing.");
  }
}

async function directoryNames(input: { path: string; limit: number; message: string }): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of await opendir(input.path)) {
    if (names.length >= input.limit) throw new RunRecordError("invalid", input.message);
    names.push(entry.name);
  }
  return names;
}

async function load(root: string, id: string, { acceptDrift = false, manifest }: { acceptDrift?: boolean; manifest?: Run } = {}) {
  const path = runPath(id);
  const run = manifest ?? parseRecord(runSchema, await readJson(root, `${path}/manifest.json`));
  if (run.runId !== id || run.projectId !== digest(root)) throw new RunRecordError("tampered", "The run belongs to another project.");
  const eventDirectory = `${path}/events`;
  const directory = await inspectPath(root, eventDirectory);
  if (!directory.exists) throw new Error("The run event directory is missing.");
  const names = (await directoryNames({ path: directory.absolute, limit: 10000, message: "The run exceeds the event limit." })).sort();
  const events: Event[] = [];
  let tip = digest(JSON.stringify(run));
  let currentBindings = run.bindings;
  let evidenceAfterChange = false;
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index + 1).padStart(6, "0")}.json`) throw new RunRecordError("tampered", "The run events have a gap or an unexpected file.");
    const event = parseRecord(eventSchema, await readJson(root, `${eventDirectory}/${name}`));
    if (event.sequence !== index + 1 || event.previous !== tip) throw new RunRecordError("tampered", "The run event chain changes.");
    if (event.artifact !== undefined) {
      const fresh = await fingerprint(root, event.artifact.path);
      if (JSON.stringify(fresh) !== JSON.stringify(event.artifact)) throw new RunRecordError("tampered", "A recorded artifact changes. Preserve the original evidence.");
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
    if (result.runId !== id || result.lastEvent !== tip || result.events !== events.length) throw new RunRecordError("tampered", "The terminal run record changes.");
    if (result.status === "complete" && !evidenceAfterChange) throw new RunRecordError("invalid", "A complete run lacks fresh artifact evidence.");
  }
  if (!acceptDrift) await checkBindings(root, currentBindings);
  return { run, path, events, tip, bindings: currentBindings, evidenceAfterChange, result };
}

type Drift = { status: "unchanged" } | { status: "changed" | "unavailable"; message: string };
type RunHeader = Pick<Run, "command" | "goal" | "createdAt">;
type RunSummary = { runId: string; directory: string } & (
  | RunHeader & {
    integrity: "valid"; status: "planned" | "active" | FinishStatus; events: number;
    finishedAt: string | null; summary: string | null; drift: Drift;
  }
  | Partial<RunHeader> & { integrity: "invalid" | "tampered"; status: "unavailable"; error: string }
);
type RunCandidate = { runId: string; directory: string } & (
  | { state: "readable"; manifest: Run }
  | { state: "unreadable"; integrity: "invalid" | "tampered"; error: string }
);

function recordFailure(cause: unknown): { integrity: "invalid" | "tampered"; status: "unavailable"; error: string } {
  return {
    integrity: cause instanceof RunRecordError ? cause.integrity : "invalid", status: "unavailable",
    error: cause instanceof Error ? cause.message : "The saved run cannot be read.",
  };
}

export async function listRuns(root: string, { limit = 20 }: { limit?: number } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Use a run limit from 1 through 100.");
  const directory = await inspectPath(root, ".avalon/runs");
  const names = directory.exists
    ? await directoryNames({ path: directory.absolute, limit: 10000, message: "The run directory exceeds the 10,000 entry limit." })
    : [];
  const candidates: RunCandidate[] = [];
  for (const runId of names) {
    const location = { runId, directory: `.avalon/runs/${runId}` };
    try {
      const path = runPath(runId);
      const entry = await inspectPath(root, path);
      if (!entry.exists || !(await lstat(entry.absolute)).isDirectory()) throw new Error("Use a real directory for each saved run.");
      const manifest = parseRecord(runSchema, await readJson(root, `${path}/manifest.json`));
      candidates.push({ ...location, state: "readable", manifest });
    } catch (cause) {
      candidates.push({ ...location, state: "unreadable", ...recordFailure(cause) });
    }
    candidates.sort((left, right) => {
      const leftTime = left.state === "readable" ? Date.parse(left.manifest.createdAt) : -Infinity;
      const rightTime = right.state === "readable" ? Date.parse(right.manifest.createdAt) : -Infinity;
      return rightTime - leftTime || left.runId.localeCompare(right.runId);
    });
    if (candidates.length > limit) candidates.pop();
  }
  const runs: RunSummary[] = [];
  for (const candidate of candidates) {
    const location = { runId: candidate.runId, directory: candidate.directory };
    if (candidate.state === "unreadable") {
      runs.push({ ...location, integrity: candidate.integrity, status: "unavailable", error: candidate.error });
      continue;
    }
    const header: RunHeader = {
      command: candidate.manifest.command, goal: candidate.manifest.goal, createdAt: candidate.manifest.createdAt,
    };
    try {
      const state = await load(root, candidate.runId, { acceptDrift: true, manifest: candidate.manifest });
      let drift: Drift;
      try {
        drift = await bindingsChanged(root, state.bindings)
          ? { status: "changed", message: "The current project files differ from the saved bindings." }
          : { status: "unchanged" };
      } catch {
        drift = { status: "unavailable", message: "The current project bindings cannot be checked. Inspect the declared input paths and metadata." };
      }
      runs.push({
        ...location, ...header, integrity: "valid", status: state.result?.status ?? (state.events.length ? "active" : "planned"),
        events: state.events.length, finishedAt: state.result?.finishedAt ?? null, summary: state.result?.summary ?? null, drift,
      });
    } catch (cause) {
      runs.push({ ...location, ...header, ...recordFailure(cause) });
    }
  }
  return {
    format: "avalon-agent-runs-v1", state: directory.exists ? "present" : "absent", total: names.length,
    limit, hasMore: names.length > limit, runs,
    scope: "Only returned runs receive full record and artifact checks. Current project drift is reported separately.",
    evidenceBasis: "Host-supplied artifact records establish byte identity. They do not establish scientific success.",
  };
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
