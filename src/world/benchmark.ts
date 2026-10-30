import { performance } from "node:perf_hooks";
import { z } from "zod";
import { challengeCandidates, runWorldChallenge, type Mutation } from "./challenge.js";
import { replayWorld, worldHash } from "./replay.js";
import { worldTasks } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

const millisecondsSchema = z.number().finite().nonnegative().brand<"Milliseconds">();
export type Milliseconds = z.infer<typeof millisecondsSchema>;
const intendedOutcome: Readonly<Record<Mutation, boolean>> = {
  "known-good": true, "claim-only": false, "claim-correct": true,
  "omit-goal": false, "unauthorized-restore": false,
};
function latency(samples: readonly Milliseconds[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    sampleSize: sorted.length, unit: "ms" as const,
    min: sorted[0]!, p50: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!, max: sorted.at(-1)!,
    uncertainty: "Observed local samples. Quantiles include clock overhead and provide no confidence interval.",
  };
}
export function runWorldBenchmark(options: { seed?: number; repetitions?: number } = {}) {
  const repetitions = z.number().int().min(1).max(1_000).parse(options.repetitions ?? 25);
  const tasks = worldTasks(options);
  const fixtures = tasks.flatMap(task => challengeCandidates(task).map(candidate => ({
    task, candidate, expected: intendedOutcome[candidate.mutation],
    receipt: replayWorld({ initial: task.initial, actions: candidate.actions }),
  })));
  type Fixture = typeof fixtures[number];
  const methods: readonly { name: string; check: (fixture: Fixture) => boolean }[] = [
    { name: "accept-all", check: () => true },
    { name: "weak-claim", check: fixture => weakWorldVerifier(fixture.receipt).accepted },
    { name: "task-oracle", check: fixture => oracleWorldVerifier({ task: fixture.task, receipt: fixture.receipt }).accepted },
  ];
  const results = methods.map(method => {
    const cases = fixtures.map(fixture => {
      const accepted = method.check(fixture);
      return {
        taskId: fixture.task.id, mutation: fixture.candidate.mutation,
        expected: fixture.expected, accepted, correct: accepted === fixture.expected,
      };
    });
    const samples: Milliseconds[] = [];
    for (let repetition = 0; repetition < repetitions; repetition++) for (const fixture of fixtures) {
      const before = performance.now();
      method.check(fixture);
      samples.push(millisecondsSchema.parse(performance.now() - before));
    }
    const correct = cases.filter(item => item.correct).length;
    return {
      method: method.name, baseline: "accept-all", sampleSize: cases.length, correct,
      accuracy: correct / cases.length,
      falseAccepts: cases.filter(item => item.accepted && !item.expected).length,
      falseRejects: cases.filter(item => !item.accepted && item.expected).length,
      latency: latency(samples), apiCalls: 0, apiCostUsd: 0,
      localComputeCostUsd: null, localComputeCostStatus: "unmeasured" as const,
      uncertainty: "Exact accuracy for this finite synthetic fixture set. Repetitions do not increase the accuracy sample size.",
      cases, missedCases: cases.filter(item => !item.correct),
    };
  });
  return {
    format: "avalon.world-benchmark/v1" as const, evidence: "synthetic" as const,
    seed: tasks[0]!.initial.seed, fixtureHash: worldHash(fixtures.map(({ task, candidate, expected }) => ({ task, candidate, expected }))),
    versions: { node: process.versions.node, zod: `${z.core.version.major}.${z.core.version.minor}.${z.core.version.patch}`, method: "1" },
    repetitions, uniqueCases: fixtures.length, baseline: "accept-all", results,
    challenge: runWorldChallenge(options),
    limits: [
      "Expected labels come from the hand-authored fixture mutations.",
      "Accuracy does not estimate real-world performance.",
      "Latency excludes fixture construction and includes clock overhead.",
      "The runner contains no API client. API calls and API fees are zero by construction.",
      "The task oracle is compared against fixture labels, not its own verdicts.",
      "No model or reinforcement learning training runs.",
    ],
  };
}
