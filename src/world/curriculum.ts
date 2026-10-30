import { z } from "zod";
import type { ReplayReceipt } from "./replay.js";
import { worldSeed, type WorldSeed } from "./state.js";
import { worldTasks, type WorldTask } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

type CurriculumEvidence = Readonly<{
  taskId: WorldTask["id"]; family: WorldTask["family"]; split: WorldTask["split"];
  oracleAccepted: boolean; verifierDisagreed: boolean;
}>;
type CurriculumCommon = Readonly<{
  seed: WorldSeed; remaining: number; maxDifficulty: 1 | 2; history: readonly CurriculumEvidence[];
}>;
export type ReadyCurriculum = CurriculumCommon & Readonly<{ phase: "ready" }>;
export type PendingCurriculum = CurriculumCommon & Readonly<{ phase: "pending"; taskId: WorldTask["id"] }>;
export type ExhaustedCurriculum = CurriculumCommon & Readonly<{ phase: "exhausted" }>;
export function startWorldCurriculum(options: { seed?: number; budget?: number } = {}): ReadyCurriculum {
  return {
    phase: "ready", seed: worldSeed(options.seed ?? 7),
    remaining: z.number().int().min(1).max(10_000).parse(options.budget ?? 8),
    maxDifficulty: 1, history: [],
  };
}
export function selectWorldTask(options: {
  state: ReadyCurriculum; split?: WorldTask["split"];
}): Readonly<{ task: WorldTask; state: PendingCurriculum }> {
  const { state } = options;
  const candidates = worldTasks({ seed: state.seed }).filter(task => task.split === (options.split ?? "train") && task.difficulty <= state.maxDifficulty);
  const score = (task: WorldTask): number => {
    const evidence = state.history.filter(item => item.taskId === task.id);
    if (evidence.length === 0) return 100;
    return evidence.reduce((sum, item) => sum + (item.oracleAccepted ? -1 : 10) + (item.verifierDisagreed ? 2 : 0), 0);
  };
  candidates.sort((left, right) => score(right) - score(left) || left.id.localeCompare(right.id, "en"));
  const task = candidates[0];
  if (!task || state.remaining < 1) throw new Error("The curriculum requires an available task and budget.");
  return {
    task,
    state: { ...state, phase: "pending", remaining: state.remaining - 1, taskId: task.id },
  };
}
export function recordWorldOutcome(options: {
  state: PendingCurriculum; receipt: ReplayReceipt;
}): ReadyCurriculum | ExhaustedCurriculum {
  const { state, receipt } = options;
  const task = worldTasks({ seed: state.seed }).find(item => item.id === state.taskId)!;
  const oracle = oracleWorldVerifier({ task, receipt });
  const weak = weakWorldVerifier(receipt);
  const history = [...state.history, {
    taskId: task.id, family: task.family, split: task.split,
    oracleAccepted: oracle.accepted, verifierDisagreed: oracle.accepted !== weak.accepted,
  }];
  const maxDifficulty = history.filter(item => item.split === "train" && item.oracleAccepted).length >= 2 ? 2 : 1;
  const common = { seed: state.seed, remaining: state.remaining, history, maxDifficulty } as const;
  return state.remaining === 0 ? { ...common, phase: "exhausted" } : { ...common, phase: "ready" };
}
export function worldCurriculumCoverage(state: CurriculumCommon) {
  return (["invoice-settlement", "ticket-resolution"] as const).map(family => ({
    family, attempts: state.history.filter(item => item.family === family).length,
    successes: state.history.filter(item => item.family === family && item.oracleAccepted).length,
    disagreements: state.history.filter(item => item.family === family && item.verifierDisagreed).length,
  }));
}
