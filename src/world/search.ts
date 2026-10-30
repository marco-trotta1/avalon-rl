import { z } from "zod";
import { replayWorld, worldHash } from "./replay.js";
import { cents, type WorldAction } from "./state.js";
import { worldTasks, type WorldTask } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

function alphabet(task: WorldTask): readonly WorldAction[] {
  return [
    { type: "claim-done" }, { type: "close-ticket" }, { type: "finish" },
    ...task.initial.invoices.map(invoice => ({ type: "pay" as const, invoice: invoice.id, amount: invoice.due })),
    { type: "pay", invoice: task.goal.payment?.invoice ?? "invoice-a", amount: cents(0) },
  ];
}
function sequences(options: { task: WorldTask; maxDepth: number }): readonly (readonly WorldAction[])[] {
  const result: WorldAction[][] = [];
  let frontier: WorldAction[][] = [[]];
  for (let depth = 1; depth <= options.maxDepth; depth++) {
    const next: WorldAction[][] = [];
    for (const prefix of frontier) for (const action of alphabet(options.task)) {
      const candidate = [...prefix, action];
      result.push(candidate);
      if (action.type !== "finish") next.push(candidate);
    }
    frontier = next;
  }
  return result;
}
export function searchWorldCounterexamples(options: { seed?: number; budget?: number; maxDepth?: number } = {}) {
  const budget = z.number().int().min(1).max(10_000).parse(options.budget ?? 1_000);
  const maxDepth = z.number().int().min(1).max(4).parse(options.maxDepth ?? 3);
  const tasks = worldTasks(options);
  const spaces = tasks.map(task => sequences({ task, maxDepth }));
  const declaredCandidates = spaces.reduce((sum, items) => sum + items.length, 0);
  const cases: {
    taskId: WorldTask["id"]; actions: readonly WorldAction[]; weakAccepted: boolean; oracleAccepted: boolean;
    classification: "agreement" | "false-accept" | "false-reject"; finalHash: string; reasons: readonly string[];
  }[] = [];
  for (let index = 0; index < spaces[0]!.length && cases.length < budget; index++) {
    for (let taskIndex = 0; taskIndex < tasks.length && cases.length < budget; taskIndex++) {
      const task = tasks[taskIndex]!;
      const actions = spaces[taskIndex]![index]!;
      const receipt = replayWorld({ initial: task.initial, actions });
      const weak = weakWorldVerifier(receipt);
      const oracle = oracleWorldVerifier({ task, receipt });
      cases.push({
        taskId: task.id, actions, weakAccepted: weak.accepted, oracleAccepted: oracle.accepted,
        classification: weak.accepted === oracle.accepted ? "agreement" : weak.accepted ? "false-accept" : "false-reject",
        finalHash: worldHash(receipt.final), reasons: oracle.reasons,
      });
    }
  }
  return {
    format: "avalon.world-search/v1" as const, evidence: "synthetic" as const,
    seed: tasks[0]!.initial.seed, fixtureHash: worldHash(tasks), budget, maxDepth,
    alphabetSizePerTask: 6, declaredCandidates, evaluated: cases.length,
    unexplored: declaredCandidates - cases.length,
    exhaustiveWithinDeclaredSpace: cases.length === declaredCandidates,
    taskCoverage: tasks.map(task => ({ taskId: task.id, evaluated: cases.filter(item => item.taskId === task.id).length })),
    falseAccepts: cases.filter(item => item.classification === "false-accept").length,
    falseRejects: cases.filter(item => item.classification === "false-reject").length,
    cases,
    limits: ["The search covers only the declared six-action alphabet and depth.", "Prefixes stop after finish.", "Counts provide no population estimate.", "No learned policy runs."],
  };
}
