import { expect, it } from "vitest";
import { stepWorld, type WorldState } from "../src/world/state.js";
import { taskEvidence, worldTasks } from "../src/world/tasks.js";

it("solves each catalog task with its explicit known-good sequence", () => {
  for (const seed of [0, 7, 100]) for (const task of worldTasks({ seed })) {
    const final = task.knownGood.reduce<WorldState>((state, action) => {
      if (state.status !== "active") throw new Error("The fixture ends before its last action.");
      return stepWorld({ state, action }).nextObservation;
    }, task.initial);
    expect(taskEvidence({ task, state: final })).toEqual({ payment: true, ticket: true, protectedInvoices: true, authority: true });
    expect(final.terminated).toBe(true);
  }
});

it("keeps evaluation families separate from training families", () => {
  const tasks = worldTasks();
  const training = new Set(tasks.filter(task => task.split === "train").map(task => task.family));
  for (const task of tasks.filter(task => task.split === "eval")) expect(training.has(task.family)).toBe(false);
});

it("separates task outcomes from protected state and authority", () => {
  const task = worldTasks()[2];
  if (!task) throw new Error("The fixture requires a ticket task.");
  const changed = stepWorld({ state: task.initial, action: { type: "pay", invoice: "invoice-b", amount: task.initial.invoices[1]!.due } }).nextObservation;
  if (changed.status !== "active") throw new Error("The fixture requires an active state.");
  const closed = stepWorld({ state: changed, action: { type: "close-ticket" } }).nextObservation;
  expect(taskEvidence({ task, state: closed })).toEqual({ payment: true, ticket: true, protectedInvoices: false, authority: false });
});
