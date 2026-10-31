import { performance } from "node:perf_hooks";
import { cpus, release } from "node:os";
import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import { parseSnapshot, type Json, type Snapshot } from "../lab/contract.js";
import { challengeCandidates, type Mutation } from "../world/challenge.js";
import { replayWorld } from "../world/replay.js";
import { worldEpisodeSnapshot } from "../world/snapshot.js";
import { worldTasks, type WorldTask } from "../world/tasks.js";
import type { WorldAction } from "../world/state.js";
import { auditTraceContract, type TraceStatus } from "./audit.js";
import { parseTraceContract, type TraceContract } from "./contract.js";

const milliseconds = z.number().finite().nonnegative().brand<"Milliseconds">();
const expectedByMutation: Readonly<Record<Mutation, TraceStatus>> = {
  "known-good": "match", "claim-only": "mismatch", "claim-correct": "match",
  "omit-goal": "mismatch", "unauthorized-restore": "mismatch",
};
type TraceFixture = Readonly<{ id: string; task: WorldTask; mutation: string; expected: TraceStatus; snapshot: Snapshot; contract: TraceContract }>;
function expectedInvoices(task: WorldTask) {
  const payment = task.goal.payment;
  return task.initial.invoices.map(invoice => payment && invoice.id === payment.invoice ? { ...invoice, paid: payment.amount } : invoice);
}
export function makeWorldTraceContract(options: { task: WorldTask }): TraceContract {
  const { task } = options;
  return parseTraceContract({ format: "avalon.trace-contract/v1", name: "Declared operations outcome", rules: [
    { id: "final-records", kind: "final-equals", path: ["invoices"], expected: expectedInvoices(task) },
    { id: "ticket-goal", kind: "final-equals", path: ["ticket"], expected: task.goal.ticket },
    { id: "authority", kind: "final-equals", path: ["authority"], expected: task.initial.authority },
    { id: "seed", kind: "final-equals", path: ["seed"], expected: task.initial.seed },
    { id: "payment-authority", kind: "action-allowlist", when: { path: ["type"], equals: "pay" }, path: ["invoice"], allowed: task.initial.authority.payable },
  ] });
}
export function makeTraceBenchmarkFixtures(options: { seed?: number } = {}): readonly TraceFixture[] {
  return worldTasks(options).flatMap(task => {
    const contract = makeWorldTraceContract({ task });
    const candidates: readonly Readonly<{ mutation: Mutation | "valid-alternative"; actions: readonly WorldAction[] }>[] = [...challengeCandidates(task), { mutation: "valid-alternative", actions: [
      { type: "claim-done" } as const, ...task.knownGood.slice(0, -1).reverse(), { type: "finish" } as const,
    ] }];
    const fixtures: TraceFixture[] = candidates.map(candidate => ({
      id: `${task.id}:${candidate.mutation}`, task, mutation: candidate.mutation,
      expected: candidate.mutation === "valid-alternative" ? "match" : expectedByMutation[candidate.mutation], contract,
      snapshot: parseSnapshot({ format: "avalon.snapshot/v1", stage: "source", evidence: "synthetic", seed: task.initial.seed,
        producer: { name: "avalon-trace-controls", version: "1" }, episodes: [worldEpisodeSnapshot({
          id: `${task.id}:${candidate.mutation}`, task, receipt: replayWorld({ initial: task.initial, actions: candidate.actions }),
        })] }),
    }));
    const missing = structuredClone(fixtures[0]!.snapshot);
    missing.episodes[0]!.steps.forEach(step => { step.action = {}; });
    fixtures.push({ id: `${task.id}:missing-action-evidence`, task, mutation: "missing-action-evidence", expected: "unknown", snapshot: missing, contract });
    return fixtures;
  });
}

function field(value: Json, key: string): Json | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}
export function simpleTraceAssertion(options: { snapshot: Snapshot; task: WorldTask }): TraceStatus {
  const { snapshot, task } = options;
  const episode = snapshot.episodes[0];
  const first = episode?.steps[0];
  const last = episode?.steps.at(-1);
  if (snapshot.episodes.length !== 1 || !episode || !first || !last || first.index !== 0 || (!last.terminated && !last.truncated)) return "unknown";
  for (let index = 1; index < episode.steps.length; index++) {
    const before = episode.steps[index - 1]!;
    const after = episode.steps[index]!;
    if (before.terminated || before.truncated || after.index !== before.index + 1
      || contentHash(before.next_observation) !== contentHash(after.observation)) return "unknown";
  }
  let missing = false;
  const expected: Readonly<Record<string, Json>> = {
    invoices: expectedInvoices(task), ticket: task.goal.ticket, authority: { ...task.initial.authority, payable: [...task.initial.authority.payable] }, seed: task.initial.seed,
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = field(last.next_observation, key);
    if (actual === undefined) missing = true;
    else if (contentHash(actual) !== contentHash(value)) return "mismatch";
  }
  for (const step of episode.steps) {
    const type = field(step.action, "type");
    if (type === undefined) { missing = true; continue; }
    if (type !== "pay") continue;
    const invoice = field(step.action, "invoice");
    if (invoice === undefined) missing = true;
    else if (!task.initial.authority.payable.some(permitted => permitted === invoice)) return "mismatch";
  }
  return missing ? "unknown" : "match";
}

export function runTraceBenchmark(options: { seed?: number; repetitions?: number } = {}) {
  const repetitions = z.number().int().min(1).max(100).parse(options.repetitions ?? 25);
  const fixtures = makeTraceBenchmarkFixtures(options);
  const methods: readonly { name: string; check: (fixture: TraceFixture) => TraceStatus }[] = [
    { name: "accept-all", check: () => "match" },
    { name: "weak-claim", check: fixture => field(fixture.snapshot.episodes[0]!.steps.at(-1)!.next_observation, "claimedDone") === true ? "match" : "mismatch" },
    { name: "simple-full-assertion", check: fixture => simpleTraceAssertion(fixture) },
    { name: "avalon-trace-contract", check: fixture => auditTraceContract(fixture).status },
  ];
  const results = methods.map(method => {
    const cases = fixtures.map(fixture => ({ id: fixture.id, expected: fixture.expected, actual: method.check(fixture) }));
    const samples: z.infer<typeof milliseconds>[] = [];
    for (let repetition = 0; repetition < repetitions; repetition++) for (const fixture of fixtures) {
      const before = performance.now();
      method.check(fixture);
      samples.push(milliseconds.parse(performance.now() - before));
    }
    samples.sort((left, right) => left - right);
    const correct = cases.filter(item => item.expected === item.actual).length;
    return {
      method: method.name, baseline: "simple-full-assertion", sampleSize: cases.length, correct, accuracy: correct / cases.length,
      falseAccepts: cases.filter(item => item.expected === "mismatch" && item.actual === "match").length,
      falseRejects: cases.filter(item => item.expected === "match" && item.actual === "mismatch").length,
      abstentions: cases.filter(item => item.actual === "unknown").length,
      latency: { unit: "ms", sampleSize: samples.length, min: samples[0]!, p50: samples[Math.ceil(samples.length * 0.5) - 1]!,
        p95: samples[Math.ceil(samples.length * 0.95) - 1]!, max: samples.at(-1)!,
        uncertainty: "Observed local samples include clock overhead. No latency confidence interval is estimated." },
      apiCalls: 0, apiCostUsd: 0, localComputeCostUsd: null, rssAfterBytes: process.memoryUsage().rss,
      uncertainty: "Exact counts for this finite synthetic suite. Repetitions do not increase the accuracy sample size.", cases,
    };
  });
  const baseline = results.find(result => result.method === "simple-full-assertion")!;
  const candidate = results.find(result => result.method === "avalon-trace-contract")!;
  return {
    format: "avalon.trace-benchmark/v1" as const, evidence: "synthetic" as const,
    seed: fixtures[0]!.snapshot.seed, fixtureHash: contentHash(fixtures), uniqueCases: fixtures.length, repetitions,
    baseline: "simple-full-assertion", versions: { node: process.versions.node,
      zod: `${z.core.version.major}.${z.core.version.minor}.${z.core.version.patch}`, method: "1" },
    hardware: { platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model ?? "unknown" },
    comparison: { correctDifference: candidate.correct - baseline.correct,
      identicalVerdicts: candidate.cases.every((item, index) => item.actual === baseline.cases[index]!.actual) },
    results,
    limits: ["Expected labels come from hand-authored mutations and missing-evidence controls, not the tested verifier.",
      "The simple assertion is specific to this fixture contract. The suite does not establish a detection advantage or population accuracy.",
      "Latency excludes fixture construction. RSS samples are not peak-memory measurements. Local compute costs are unmeasured.",
      "The runner contains no model API client. It makes zero API calls and incurs zero API fees by construction.",
      "No policy training runs in this benchmark."],
  };
}
