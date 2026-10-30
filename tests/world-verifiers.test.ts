import { expect, it } from "vitest";
import { runWorldDemo } from "../src/world/demo.js";
import { replayWorld } from "../src/world/replay.js";
import { worldTasks } from "../src/world/tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "../src/world/verifiers.js";

it("exposes rewarded wrong outcomes and unrewarded correct outcomes", () => {
  const report = runWorldDemo();
  expect(report.summary).toEqual({ tasks: 4, episodes: 8, falseAccepts: 4, falseRejects: 4, counterexamples: 8 });
  for (const example of report.counterexamples.filter(item => item.kind === "false-accept")) {
    expect(example.reward).toBe(1);
    expect(example.oracleAccepted).toBe(false);
    expect(example.reasons.length).toBeGreaterThan(0);
  }
});

it("checks authority independently of the event authorization label", () => {
  const task = worldTasks()[2]!;
  const receipt = replayWorld({ initial: task.initial, actions: [
    { type: "pay", invoice: "invoice-b", amount: task.initial.invoices[1]!.due },
    { type: "close-ticket" }, { type: "claim-done" }, { type: "finish" },
  ] });
  expect(weakWorldVerifier(receipt).accepted).toBe(true);
  expect(oracleWorldVerifier({ task, receipt }).reasons).toContain("A payment exceeds the initial authority.");
});

it("does not treat termination or a claim as oracle success", () => {
  for (const task of worldTasks()) {
    const failed = replayWorld({ initial: task.initial, actions: [{ type: "finish" }] });
    expect(oracleWorldVerifier({ task, receipt: failed }).accepted).toBe(false);
    const good = replayWorld({ initial: task.initial, actions: task.knownGood });
    expect(oracleWorldVerifier({ task, receipt: good }).accepted).toBe(true);
    expect(weakWorldVerifier(good).accepted).toBe(false);
  }
});
