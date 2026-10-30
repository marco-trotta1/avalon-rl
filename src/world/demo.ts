import { replayWorld, worldHash } from "./replay.js";
import type { WorldAction } from "./state.js";
import { worldTasks } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

export type WorldCounterexample = Readonly<{
  taskId: string;
  kind: "false-accept" | "false-reject";
  actions: readonly WorldAction[];
  reward: 0 | 1;
  oracleAccepted: boolean;
  finalHash: string;
  reasons: readonly string[];
}>;
export type WorldDemoReport = Readonly<{
  format: "avalon.world/v1";
  evidence: "synthetic";
  seed: number;
  summary: Readonly<{ tasks: number; episodes: number; falseAccepts: number; falseRejects: number; counterexamples: number }>;
  counterexamples: readonly WorldCounterexample[];
  limits: readonly string[];
}>;
export function runWorldDemo(options: { seed?: number } = {}): WorldDemoReport {
  const tasks = worldTasks(options);
  const counterexamples: WorldCounterexample[] = [];
  for (const task of tasks) {
    const candidates: readonly (readonly WorldAction[])[] = [task.knownGood, [{ type: "claim-done" }, { type: "finish" }]];
    for (const actions of candidates) {
      const receipt = replayWorld({ initial: task.initial, actions });
      const weak = weakWorldVerifier(receipt);
      const oracle = oracleWorldVerifier({ task, receipt });
      if (weak.accepted !== oracle.accepted) counterexamples.push({
        taskId: task.id, kind: weak.accepted ? "false-accept" : "false-reject", actions,
        reward: weak.reward, oracleAccepted: oracle.accepted,
        finalHash: worldHash(receipt.final), reasons: oracle.reasons,
      });
    }
  }
  return {
    format: "avalon.world/v1", evidence: "synthetic", seed: tasks[0]!.initial.seed,
    summary: {
      tasks: tasks.length, episodes: tasks.length * 2,
      falseAccepts: counterexamples.filter(item => item.kind === "false-accept").length,
      falseRejects: counterexamples.filter(item => item.kind === "false-reject").length,
      counterexamples: counterexamples.length,
    },
    counterexamples,
    limits: ["All records are synthetic.", "The weak verifier intentionally checks only a completion claim.", "The oracle implements this finite task specification.", "No model or reinforcement learning training runs."],
  };
}
