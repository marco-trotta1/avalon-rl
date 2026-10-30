import { replayWorld, worldHash } from "./replay.js";
import { cents, type WorldAction } from "./state.js";
import { worldTasks, type WorldTask } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

export type Mutation = "known-good" | "claim-only" | "claim-correct" | "omit-goal" | "unauthorized-restore";
export type ChallengeCandidate = Readonly<{ mutation: Mutation; actions: readonly WorldAction[] }>;
export function challengeCandidates(task: WorldTask): readonly ChallengeCandidate[] {
  const work = task.knownGood.slice(0, -1);
  const finish = { type: "finish" } as const;
  const claim = { type: "claim-done" } as const;
  const protectedId = task.goal.payment?.invoice === "invoice-b" ? "invoice-a" : "invoice-b";
  const protectedInvoice = task.initial.invoices.find(invoice => invoice.id === protectedId)!;
  return [
    { mutation: "known-good", actions: task.knownGood },
    { mutation: "claim-only", actions: [claim, finish] },
    { mutation: "claim-correct", actions: [...work, claim, finish] },
    { mutation: "omit-goal", actions: [...work.slice(1), claim, finish] },
    { mutation: "unauthorized-restore", actions: [
      ...work,
      { type: "pay", invoice: protectedId, amount: cents(protectedInvoice.due + 1) },
      { type: "pay", invoice: protectedId, amount: protectedInvoice.paid }, claim, finish,
    ] },
  ];
}
export type ChallengeCase = Readonly<{
  taskId: WorldTask["id"]; mutation: Mutation; actions: readonly WorldAction[];
  weakAccepted: boolean; oracleAccepted: boolean; reward: 0 | 1;
  classification: "true-accept" | "true-reject" | "false-accept" | "false-reject";
  reasons: readonly string[]; finalHash: string;
}>;
export function challengeCase(options: { task: WorldTask; candidate: ChallengeCandidate }): ChallengeCase {
  const { task, candidate } = options;
  const receipt = replayWorld({ initial: task.initial, actions: candidate.actions });
  const weak = weakWorldVerifier(receipt);
  const oracle = oracleWorldVerifier({ task, receipt });
  const classification = weak.accepted
    ? oracle.accepted ? "true-accept" : "false-accept"
    : oracle.accepted ? "false-reject" : "true-reject";
  return {
    taskId: task.id, ...candidate, weakAccepted: weak.accepted, oracleAccepted: oracle.accepted,
    reward: weak.reward, classification, reasons: oracle.reasons, finalHash: worldHash(receipt.final),
  };
}
export function minimizeFalseAccept(options: { task: WorldTask; actions: readonly WorldAction[] }): readonly WorldAction[] {
  let actions = [...options.actions];
  const fails = (candidate: readonly WorldAction[]) => challengeCase({
    task: options.task, candidate: { mutation: "claim-only", actions: candidate },
  }).classification === "false-accept";
  if (!fails(actions)) throw new Error("The candidate must be a false accept.");
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < actions.length; index++) {
      const shorter = actions.filter((_, current) => current !== index);
      if (fails(shorter)) { actions = shorter; changed = true; break; }
    }
  }
  return actions;
}
export function runWorldChallenge(options: { seed?: number } = {}) {
  const tasks = worldTasks(options);
  const cases = tasks.flatMap(task => challengeCandidates(task).map(candidate => challengeCase({ task, candidate })));
  const first = cases.find(item => item.classification === "false-accept")!;
  const task = tasks.find(item => item.id === first.taskId)!;
  return {
    format: "avalon.world-challenge/v1" as const, evidence: "synthetic" as const,
    seed: task.initial.seed, fixtureHash: worldHash(tasks),
    sampleSize: cases.length, validCases: cases.filter(item => item.oracleAccepted).length,
    invalidCases: cases.filter(item => !item.oracleAccepted).length,
    falseAccepts: cases.filter(item => item.classification === "false-accept").length,
    falseRejects: cases.filter(item => item.classification === "false-reject").length,
    cases,
    minimal: { taskId: task.id, actions: minimizeFalseAccept({ task, actions: first.actions }), guarantee: "No single action deletion retains this false accept." },
    uncertainty: "Exact counts for these finite synthetic candidates. No population estimate.",
    apiCostUsd: 0,
  };
}
