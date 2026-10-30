import { z } from "zod";
import {
  cents, makeWorldSnapshot, oracleWorldVerifier, recordWorldOutcome, replayWorld,
  runWorldBenchmark, runWorldChallenge, runWorldDemo, searchWorldCounterexamples,
  selectWorldTask, startWorldCurriculum, weakWorldVerifier, worldCurriculumCoverage, worldTasks,
  type ExhaustedCurriculum, type ReadyCurriculum,
} from "../world/index.js";
import { readLocalText } from "./io.js";

const planSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff).default(7),
  task: z.enum(["settle-a", "settle-b", "close-ticket", "settle-and-close"]),
  actions: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("pay"), invoice: z.enum(["invoice-a", "invoice-b"]), amount: z.unknown().transform(value => cents(value)) }).strict(),
    z.object({ type: z.literal("close-ticket") }).strict(),
    z.object({ type: z.literal("claim-done") }).strict(),
    z.object({ type: z.literal("finish") }).strict(),
  ])).min(1).max(128),
}).strict();

export type WorldCommand = "world-demo" | "world-challenge" | "world-search" | "world-benchmark" | "world-curriculum" | "world-export" | "world-run";
export async function runWorldCommand({ command, seed, budget, depth, repetitions, data }: {
  command: WorldCommand; seed: number; budget?: number; depth?: number; repetitions?: number; data?: string;
}): Promise<object> {
  switch (command) {
    case "world-demo": return runWorldDemo({ seed });
    case "world-challenge": return runWorldChallenge({ seed });
    case "world-search": return searchWorldCounterexamples({ seed, budget, maxDepth: depth });
    case "world-benchmark": return runWorldBenchmark({ seed, repetitions });
    case "world-export": return makeWorldSnapshot({ seed });
    case "world-curriculum": {
      let state: ReadyCurriculum | ExhaustedCurriculum = startWorldCurriculum({ seed, budget });
      while (state.phase === "ready") {
        const selection = selectWorldTask({ state });
        const receipt = replayWorld({ initial: selection.task.initial, actions: selection.task.knownGood });
        state = recordWorldOutcome({ state: selection.state, receipt });
      }
      return {
        format: "avalon.world-curriculum/v1", evidence: "synthetic", policy: "known-good-script",
        state, coverage: worldCurriculumCoverage(state),
        limits: ["This is a deterministic task schedule. No policy or model training runs.", "The script uses known-good actions. Its results do not measure generalization."],
      };
    }
    case "world-run": {
      if (!data) throw new Error("Supply a world action plan.");
      const raw: unknown = JSON.parse(await readLocalText(data));
      const plan = planSchema.parse(raw);
      const task = worldTasks({ seed: plan.seed }).find(item => item.id === plan.task);
      if (!task) throw new Error("Select a documented world task.");
      const receipt = replayWorld({ initial: task.initial, actions: plan.actions });
      return {
        format: "avalon.world-run/v1", evidence: "synthetic", task: task.id, receipt,
        weak: weakWorldVerifier(receipt), oracle: oracleWorldVerifier({ task, receipt }),
        limits: ["Actions affect synthetic local records only. No payment or external action occurs."],
      };
    }
    default: { const impossible: never = command; return impossible; }
  }
}
