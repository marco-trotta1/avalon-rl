import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { challengeCase, minimizeFalseAccept, runWorldChallenge } from "../src/world/challenge.js";
import { worldTasks } from "../src/world/tasks.js";

it("retains all finite challenge outcomes and both verifier errors", () => {
  const report = runWorldChallenge();
  expect(report).toMatchObject({ sampleSize: 20, validCases: 8, invalidCases: 12, falseAccepts: 12, falseRejects: 4 });
  expect(report.cases).toHaveLength(20);
  for (const item of report.cases.filter(item => item.mutation === "unauthorized-restore")) {
    expect(item.reasons).toContain("A payment exceeds the initial authority.");
  }
});

it("reduces a false accept to a deletion-minimal valid action sequence", () => {
  const task = worldTasks()[0]!;
  const actions = [{ type: "claim-done" }, { type: "finish" }] as const;
  const minimal = minimizeFalseAccept({ task, actions });
  expect(minimal).toEqual([{ type: "claim-done" }]);
  expect(() => minimizeFalseAccept({ task, actions: task.knownGood })).toThrow("false accept");
  expect(challengeCase({ task, candidate: { mutation: "claim-only", actions: [] } }).classification).toBe("true-reject");
});

it("reproduces the public synthetic counterexample fixture", () => {
  const fixture = JSON.parse(readFileSync(new URL("../examples/world/claim-only.json", import.meta.url), "utf8")) as {
    seed: number; taskId: string; actions: [{ type: "claim-done" }]; expected: { classification: string };
  };
  const task = worldTasks({ seed: fixture.seed }).find(item => item.id === fixture.taskId)!;
  expect(challengeCase({ task, candidate: { mutation: "claim-only", actions: fixture.actions } }).classification).toBe(fixture.expected.classification);
});
