import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import { parseSnapshot, type Json, type Snapshot } from "../lab/contract.js";
import { readLocalText } from "../lab/io.js";
import { parseTrial, runTrial } from "./run.js";
import { requestProcess, ProcessRequestError } from "./process.js";
import { renderTrialSummary } from "./summary.js";
import {
  parseSession, observationSchema, stepResultSchema, judgmentSchema, agentResultSchema, descriptionSchema,
  millisecondsSchema, usdSchema, type Session, type SessionCase, type ProcessSpec,
} from "./session-contract.js";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const MAX_RECORD_BYTES = 10 * 1024 * 1024;

async function save(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

export async function loadSession(path: string): Promise<Session> {
  const session = parseSession(JSON.parse(await readLocalText(path)) as unknown);
  const normalize = (spec: ProcessSpec): ProcessSpec => ({ ...spec, script: resolve(dirname(path), spec.script) });
  return { ...session, adapter: normalize(session.adapter), cases: session.cases.map(item => ({
    ...item, policy: item.policy.kind === "scripted" ? item.policy : { ...item.policy, process: normalize(item.policy.process) },
  })) };
}

async function sources(session: Session) {
  const specs = [session.adapter, ...session.cases.flatMap(item => item.policy.kind === "agent" ? [item.policy.process] : [])];
  return Promise.all(specs.map(async spec => ({ ...spec, sha256: hash(await readLocalText(spec.script)) })));
}

type Journal = { bytes: number; index: number; path: string };
async function call(options: {
  spec: ProcessSpec; request: Json; session: Session; journal: Journal;
}): Promise<unknown> {
  const { spec, request, session, journal } = options;
  const number = String(journal.index++).padStart(5, "0");
  journal.bytes += Buffer.byteLength(JSON.stringify(request));
  if (journal.bytes > MAX_RECORD_BYTES) throw new Error("The session exceeds the 10 MiB request and response budget.");
  await save(join(journal.path, `${number}-request.json`), { spec, request });
  let response: unknown;
  try { response = await requestProcess({ spec, request, limits: session.limits }); }
  catch (error) {
    if (error instanceof ProcessRequestError) await save(join(journal.path, `${number}-error.json`), error.details);
    throw error;
  }
  journal.bytes += Buffer.byteLength(JSON.stringify(response));
  if (journal.bytes > MAX_RECORD_BYTES) throw new Error("The session exceeds the 10 MiB request and response budget.");
  await save(join(journal.path, `${number}-response.json`), response);
  return response;
}

async function executeCase(options: {
  session: Session; item: SessionCase; directory: string; journal: Journal;
  actions?: readonly Json[];
}) {
  const { session, item, directory, journal } = options;
  await mkdir(directory, { mode: 0o700 });
  const adapter = (operation: string, extra: Record<string, Json> = {}) => call({ spec: session.adapter, session, journal,
    request: { format: "avalon.adapter-request/v1", operation, workspace: directory, reset: item.reset,
      seed: item.seed, task: item.task, ...extra } });
  const started = performance.now();
  z.object({ reset: z.literal(true) }).strict().parse(await adapter("reset"));
  let observation = observationSchema.parse(await adapter("observe")).observation;
  const initialHash = contentHash(observation);
  const steps: Json[] = [];
  const actions: Json[] = [];
  let agentCost = usdSchema.parse(0);
  const plan = options.actions ?? (item.policy.kind === "scripted" ? item.policy.actions : undefined);
  for (let index = 0; index < session.limits.maxSteps; index++) {
    let action: Json;
    if (plan) {
      if (index >= plan.length) break;
      action = plan[index]!;
    } else {
      if (item.policy.kind !== "agent") throw new Error("The case requires an agent or a scripted plan.");
      const result = agentResultSchema.parse(await call({ spec: item.policy.process, session, journal, request: {
        format: "avalon.agent-request/v1", task: item.task, seed: item.seed, index, observation,
        config: item.policy.config ?? null,
        history: steps, remainingSteps: session.limits.maxSteps - index,
        remainingCostUsd: Math.max(0, session.limits.maxAgentCostUsd - agentCost),
      } }));
      agentCost = usdSchema.parse(agentCost + result.costUsd);
      if (agentCost > session.limits.maxAgentCostUsd + 1e-9) {
        throw new Error("The agent reports a cost above the case budget. The latest action does not execute.");
      }
      action = result.action;
    }
    const result = stepResultSchema.parse(await adapter("step", { action }));
    const next = observationSchema.parse(await adapter("observe")).observation;
    actions.push(action);
    const exhausted = index + 1 === session.limits.maxSteps || (plan !== undefined && index + 1 === plan.length);
    steps.push({ index, observation, action, reward: result.reward, next_observation: next,
      terminated: result.terminated, truncated: result.truncated || (exhausted && !result.terminated) });
    observation = next;
    if (result.terminated || result.truncated) break;
  }
  if (steps.length === 0) throw new Error("The case produces no transitions.");
  const judgment = judgmentSchema.parse(await adapter("judge"));
  const snapshot = parseSnapshot({ format: "avalon.snapshot/v1", stage: "source",
    producer: { name: "avalon-session", version: "1" }, seed: item.seed, evidence: session.evidence,
    episodes: [{ id: item.id, task: item.task, steps }] });
  return { snapshot, judgment, initialHash, actions,
    latencyMs: millisecondsSchema.parse(performance.now() - started), agentCostUsd: agentCost };
}

function compareExecution(expected: Awaited<ReturnType<typeof executeCase>>, actual: Awaited<ReturnType<typeof executeCase>>) {
  const expectedSteps = expected.snapshot.episodes[0]!.steps;
  const actualSteps = actual.snapshot.episodes[0]!.steps;
  const firstDifferentStep = Array.from({ length: Math.max(expectedSteps.length, actualSteps.length) }, (_, index) => index)
    .find(index => contentHash(expectedSteps[index] ?? null) !== contentHash(actualSteps[index] ?? null)) ?? null;
  const initialMatches = expected.initialHash === actual.initialHash;
  const judgmentMatches = contentHash(expected.judgment) === contentHash(actual.judgment);
  return { matches: initialMatches && judgmentMatches && firstDifferentStep === null,
    initialMatches, judgmentMatches, firstDifferentStep };
}

export async function runSession(options: { data: string; out: string }): Promise<number> {
  const session = await loadSession(resolve(options.data));
  const sourceFiles = await sources(session);
  const out = resolve(options.out);
  await mkdir(out, { mode: 0o700 });
  const journal: Journal = { bytes: 0, index: 0, path: join(out, "requests") };
  await mkdir(journal.path, { mode: 0o700 });
  await mkdir(join(out, "cases"), { mode: 0o700 });
  await save(join(out, "session.json"), session);
  await save(join(out, "sources.json"), sourceFiles);
  try {
    const description = descriptionSchema.parse(await call({ spec: session.adapter, session, journal,
      request: { format: "avalon.adapter-request/v1", operation: "describe" } }));
    const records = [];
    const cases = [];
    for (const item of session.cases) {
      const directory = join(out, "cases", item.id);
      await mkdir(directory, { mode: 0o700 });
      const execution = await executeCase({ session, item, directory: join(directory, "first"), journal });
      await save(join(directory, "execution.json"), execution);
      await save(join(directory, "snapshot.json"), execution.snapshot);
      await save(join(directory, "contract.json"), item.contract);
      const repeated = await executeCase({ session, item, directory: join(directory, "replay"), journal, actions: execution.actions });
      await save(join(directory, "repeated.json"), repeated);
      const replay = compareExecution(execution, repeated);
      records.push({ id: item.id, replay, judgment: execution.judgment, agentCostUsd: execution.agentCostUsd,
        firstLatencyMs: execution.latencyMs, replayLatencyMs: repeated.latencyMs });
      cases.push({ id: item.id, group: item.group, split: item.split,
        origin: session.evidence === "user-supplied" && item.policy.kind === "agent" ? "observed" : "authored-control",
        expected: execution.judgment.status, labelEvidence: `cases/${item.id}/execution.json: adapter judgment`,
        execution: null, snapshot: execution.snapshot, contract: item.contract, baseline: item.baseline });
    }
    const trial = parseTrial({ format: "avalon.trial/v1", id: session.id, authorization: session.authorization,
      protocol: session.protocol, cases });
    const trialText = JSON.stringify(trial);
    if (Buffer.byteLength(trialText) > MAX_RECORD_BYTES) throw new Error("The collected trial exceeds 10 MiB.");
    const report = runTrial(trial);
    await save(join(out, "trial.json"), trial);
    await save(join(out, "report.json"), report);
    await save(join(out, "collection.json"), {
      format: "avalon.collection/v1", sessionHash: contentHash(session), description, records,
      independentComparison: {
        samples: records.length,
        baselineAgreements: records.filter(item => item.judgment.baseline === item.judgment.status).length,
        avalonAgreements: report.cases.filter(item => item.avalon.status === item.expected).length,
        limits: "The adapter provides both the reference judgment and independent baseline. This is not independent human review.",
      },
      limits: ["Replay executes captured actions without calling the agent again.",
        "The adapter supplies independent labels and its own baseline. Review its implementation before using those labels.",
        "Agent costs are self-reported. Compute and engineering costs remain unpriced.",
        "Latency includes process startup, recording, and observation. There is one timing per execution.",
        "The reference tasks are synthetic. They do not establish customer value or training improvement."],
    });
    await writeFile(join(out, "review.md"), renderTrialSummary(report), { flag: "wx", mode: 0o600 });
    if (contentHash(await sources(session)) !== contentHash(sourceFiles)) throw new Error("An adapter or agent source changes during execution.");
    await seal(out, session);
    process.stdout.write(`The private session is complete: ${out}\n`);
    if (records.some(item => !item.replay.matches) || report.cases.some(item => item.avalon.status !== item.expected)) return 4;
    return report.cases.some(item => item.avalon.status === "unknown") ? 5 : 0;
  } catch (error) {
    await save(join(out, "failure.json"), { status: "failed", message: error instanceof Error ? error.message : "The session fails.",
      attemptedRequests: journal.index, limits: "Partial artifacts remain private. No retry occurs." });
    throw error;
  }
}

function sealedPaths(session: Session): string[] {
  return ["session.json", "sources.json", "trial.json", "report.json", "collection.json", "review.md",
    ...session.cases.flatMap(item => ["execution.json", "snapshot.json", "contract.json", "repeated.json"].map(file => `cases/${item.id}/${file}`))];
}

async function seal(out: string, session: Session) {
  const files = await Promise.all(sealedPaths(session).map(async path => ({ path, sha256: hash(await readFile(join(out, path))) })));
  await save(join(out, "manifest.json"), { format: "avalon.session-manifest/v1", files,
    limits: "Hashes detect changed listed artifacts. They do not authenticate the recorder. Request logs and sandbox databases are not sealed." });
}

const manifestSchema = z.object({ format: z.literal("avalon.session-manifest/v1"),
  files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(406),
  limits: z.string(),
}).strict();

async function verifyBundle(bundle: string) {
  const session = await loadSession(join(bundle, "session.json"));
  const manifest = manifestSchema.parse(JSON.parse(await readLocalText(join(bundle, "manifest.json"))) as unknown);
  const paths = sealedPaths(session);
  if (manifest.files.length !== paths.length || new Set(manifest.files.map(file => file.path)).size !== paths.length
    || manifest.files.some(file => !paths.includes(file.path))) throw new Error("The bundle manifest has an unexpected file list.");
  for (const file of manifest.files) {
    if (hash(await readFile(join(bundle, file.path))) !== file.sha256) throw new Error("A sealed bundle file changes. Replay does not start.");
  }
  const originalSources: unknown = JSON.parse(await readLocalText(join(bundle, "sources.json")));
  if (contentHash(await sources(session)) !== contentHash(originalSources as Json)) throw new Error("The adapter or agent source changes. Replay does not start.");
  return session;
}

export async function replaySession(options: { bundle: string; out: string }): Promise<number> {
  const bundle = resolve(options.bundle);
  const session = await verifyBundle(bundle);
  const out = resolve(options.out);
  await mkdir(out, { mode: 0o700 });
  const journal: Journal = { bytes: 0, index: 0, path: join(out, "requests") };
  await mkdir(journal.path, { mode: 0o700 });
  try {
    const originalCollection = z.object({ description: descriptionSchema }).passthrough().parse(
      JSON.parse(await readLocalText(join(bundle, "collection.json"))) as unknown);
    const description = descriptionSchema.parse(await call({ spec: session.adapter, session, journal,
      request: { format: "avalon.adapter-request/v1", operation: "describe" } }));
    if (contentHash(description) !== contentHash(originalCollection.description)) throw new Error("The adapter runtime changes. Replay stops.");
    const results = [];
    for (const item of session.cases) {
      const snapshot = parseSnapshot(JSON.parse(await readLocalText(join(bundle, "cases", item.id, "snapshot.json"))) as unknown);
      const saved = z.object({ judgment: judgmentSchema }).passthrough().parse(
        JSON.parse(await readLocalText(join(bundle, "cases", item.id, "execution.json"))) as unknown);
      const expected = { snapshot, judgment: saved.judgment,
        initialHash: contentHash(snapshot.episodes[0]!.steps[0]!.observation),
        actions: snapshot.episodes[0]!.steps.map(step => step.action), latencyMs: millisecondsSchema.parse(0), agentCostUsd: usdSchema.parse(0) };
      const actual = await executeCase({ session, item, directory: join(out, item.id), journal, actions: expected.actions });
      await save(join(out, `${item.id}.json`), actual);
      results.push({ id: item.id, ...compareExecution(expected, actual) });
    }
    await verifyBundle(bundle);
    await save(join(out, "replay.json"), { format: "avalon.session-replay/v1", results,
      limits: "This replays captured actions in a fresh sandbox. It does not repeat model inference or establish external outcomes." });
    process.stdout.write(`The private replay is complete: ${out}\n`);
    return results.every(result => result.matches) ? 0 : 4;
  } catch (error) {
    await save(join(out, "failure.json"), { status: "failed", message: error instanceof Error ? error.message : "Replay fails." });
    throw error;
  }
}

export async function exportTrialTask(options: { bundle: string; caseId: string; out: string }): Promise<void> {
  const bundle = resolve(options.bundle);
  const session = await verifyBundle(bundle);
  const item = session.cases.find(candidate => candidate.id === options.caseId);
  if (!item) throw new Error("Select a case identifier from the bundle.");
  const out = resolve(options.out);
  const adapterName = `adapter${extname(session.adapter.script)}`;
  const adapterText = await readLocalText(session.adapter.script);
  const snapshot = parseSnapshot(JSON.parse(await readLocalText(join(bundle, "cases", item.id, "snapshot.json"))) as unknown);
  await mkdir(out, { mode: 0o700 });
  await writeFile(join(out, adapterName), adapterText, { flag: "wx", mode: 0o600 });
  const taskSession = { ...session, id: item.id, adapter: { ...session.adapter, script: adapterName }, cases: [{
    ...item, policy: { kind: "scripted", actions: snapshot.episodes[0]!.steps.map(step => step.action) },
  }] };
  await save(join(out, "session.json"), taskSession);
  await save(join(out, "snapshot.json"), snapshot);
  await save(join(out, "contract.json"), item.contract);
  await save(join(out, "provenance.json"), { format: "avalon.task-export/v1", sourceSessionHash: contentHash(session),
    sourceSnapshotHash: contentHash(snapshot), adapterSha256: hash(adapterText),
    limits: "This copies the adapter entry file and captured actions. Install and pin imported dependencies separately. It does not package model weights." });
  await writeFile(join(out, "START.md"), `# Reproduce the exported task

This package contains private task data. Review it before sharing.
Read the adapter before executing it. It runs with your user permissions.
Install the declared adapter runtime and its dependencies.

Run the task from this directory:

\`\`\`sh
avalon trial run --data session.json --out reproduction
avalon trace-audit --data snapshot.json --contract contract.json
\`\`\`

The first command replays captured actions in a fresh environment twice.
The second command returns code 4 for a recorded mismatch and code 5 for unknown evidence.
Replace the scripted policy with an agent process to evaluate a new policy on this task.
Keep the original package and freeze a new session before comparing a changed policy.
The adapter supports reset, observe, step, and judge operations for a training integration.
This package does not train a model or establish that the task improves learning.
`, { flag: "wx", mode: 0o600 });
  process.stdout.write(`The private task package is ready: ${out}\n`);
}
