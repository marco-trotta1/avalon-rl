import { expect, it } from "vitest";
import { recordWorldOutcome, selectWorldTask, startWorldCurriculum, worldCurriculumCoverage } from "../src/world/curriculum.js";
import { replayWorld } from "../src/world/replay.js";

it("selects deterministically, covers tasks, and spends a finite budget", () => {
  let state = startWorldCurriculum({ budget: 3 });
  const selected: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const selection = selectWorldTask({ state });
    selected.push(selection.task.id);
    expect(selectWorldTask({ state })).toEqual(selection);
    const receipt = replayWorld({ initial: selection.task.initial, actions: attempt === 0 ? [{ type: "claim-done" }] : selection.task.knownGood });
    const next = recordWorldOutcome({ state: selection.state, receipt });
    if (next.phase === "ready") state = next;
    else {
      expect(attempt).toBe(2);
      expect(next.remaining).toBe(0);
      expect(worldCurriculumCoverage(next)[0]?.attempts).toBe(3);
    }
  }
  expect(selected).toEqual(["settle-a", "settle-b", "settle-a"]);
});

it("uses training evidence to unlock difficulty and isolates evaluation families", () => {
  let state = startWorldCurriculum({ budget: 5 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const selection = selectWorldTask({ state });
    expect(selection.task.split).toBe("train");
    const receipt = replayWorld({ initial: selection.task.initial, actions: selection.task.knownGood });
    const next = recordWorldOutcome({ state: selection.state, receipt });
    if (next.phase !== "ready") throw new Error("The fixture requires remaining budget.");
    state = next;
  }
  expect(state.maxDifficulty).toBe(2);
  const evaluation = selectWorldTask({ state, split: "eval" });
  expect(evaluation.task.family).toBe("ticket-resolution");
  expect(worldCurriculumCoverage(state)[1]?.attempts).toBe(0);
});

it("does not promote difficulty from a rewarded false claim", () => {
  const selection = selectWorldTask({ state: startWorldCurriculum() });
  const receipt = replayWorld({ initial: selection.task.initial, actions: [{ type: "claim-done" }] });
  const next = recordWorldOutcome({ state: selection.state, receipt });
  expect(next.maxDifficulty).toBe(1);
  expect(next.history[0]).toMatchObject({ oracleAccepted: false, verifierDisagreed: true });
});

it("selects an unseen eligible task before repeated failures and then prioritizes seen failures", () => {
  let state = startWorldCurriculum({ seed: 7, budget: 20 });
  for (let attempt = 0; attempt < 11; attempt++) {
    const split = attempt < 9 ? "eval" : "train";
    const selection = selectWorldTask({ state, split });
    const actions = attempt < 9 ? [{ type: "claim-done" } as const] : selection.task.knownGood;
    const receipt = replayWorld({ initial: selection.task.initial, actions });
    const next = recordWorldOutcome({ state: selection.state, receipt });
    if (next.phase !== "ready") throw new Error("The fixture requires remaining budget.");
    state = next;
  }
  const unseen = selectWorldTask({ state, split: "eval" });
  expect(unseen.task.id).toBe("settle-and-close");
  const receipt = replayWorld({ initial: unseen.task.initial, actions: unseen.task.knownGood });
  const next = recordWorldOutcome({ state: unseen.state, receipt });
  if (next.phase !== "ready") throw new Error("The fixture requires remaining budget.");
  expect(selectWorldTask({ state: next, split: "eval" }).task.id).toBe("close-ticket");
});
