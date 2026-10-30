import { describe, expect, it } from "vitest";
import { makeWorldMdp, makeWorldMdpSuite } from "../src/world/mdp.js";
import { worldTasks } from "../src/world/tasks.js";
import { replayWorld } from "../src/world/replay.js";
import { oracleWorldVerifier } from "../src/world/verifiers.js";
import type { WorldAction } from "../src/world/state.js";

describe("finite world MDP", () => {
  it("preserves every bounded action path through the quotient table", () => {
    for (const task of worldTasks({ seed: 19 })) {
      const table = makeWorldMdp({ task, horizon: 3 });
      const states = new Map(table.states.map(state => [state.id, state]));
      const walk = (stateId: string, actions: readonly WorldAction[]): void => {
        const state = states.get(stateId)!;
        const replay = replayWorld({ initial: task.initial, actions, maxSteps: 3 });
        expect(state.observation.invoices).toEqual(replay.final.invoices);
        expect(state.history.prohibitedActions).toBe(replay.final.events.filter(event => !event.authorized).length);
        expect(state.remaining).toBe(3 - actions.length);
        if (replay.final.status !== "active") { expect(state.transitions).toHaveLength(0); return; }
        expect(state.transitions).toHaveLength(table.actions.length);
        for (const edge of state.transitions) {
          const action = table.actions.find(item => item.id === edge.action)!.action;
          const nextActions = [...actions, action];
          const actual = replayWorld({ initial: task.initial, actions: nextActions, maxSteps: 3 });
          expect(edge.terminated).toBe(actual.final.terminated);
          expect(edge.truncated).toBe(actual.final.truncated);
          if (edge.outcome) expect(edge.outcome.valid).toBe(oracleWorldVerifier({ task, receipt: actual }).accepted);
          walk(edge.nextState, nextActions);
        }
      };
      walk(table.initialState, []);
    }
  });
  it("retains restored unauthorized actions and keeps labels out of policy keys", () => {
    const table = makeWorldMdp({ task: worldTasks()[0]!, horizon: 4 });
    let state = table.states[0]!;
    let last = state.transitions[0]!;
    for (const action of ["pay-a", "pay-b", "restore-b", "finish"]) {
      last = state.transitions.find(edge => edge.action === action)!;
      state = table.states.find(item => item.id === last.nextState)!;
    }
    expect(last.rewards).toEqual({ claim: 0, final: 1, history: 0 });
    expect(last.outcome).toMatchObject({ valid: false, prohibitedActions: 2, goalComplete: true, protectedPreserved: true });
    expect(JSON.parse(state.observationKey)).toMatchObject({ remaining: 0, prohibitedActions: 2 });
    for (const key of ["task", "seed", "split", "rewards", "outcome", "valid"]) expect(JSON.parse(state.observationKey)).not.toHaveProperty(key);
  });
  it("is deterministic, transfers feature keys across seeds, and validates its horizon", () => {
    expect(makeWorldMdpSuite({ seed: 7, horizon: 2 })).toEqual(makeWorldMdpSuite({ seed: 7, horizon: 2 }));
    const first = makeWorldMdpSuite({ seed: 7, horizon: 2 });
    const second = makeWorldMdpSuite({ seed: 101, horizon: 2 });
    expect(first.map(table => table.states.map(state => state.observationKey)))
      .toEqual(second.map(table => table.states.map(state => state.observationKey)));
    for (const horizon of [0, 7, 1.5]) expect(() => makeWorldMdp({ task: worldTasks()[0]!, horizon })).toThrow();
  });
  it("rejects tasks outside the catalog before applying the state quotient", () => {
    const task = worldTasks()[0]!;
    expect(() => makeWorldMdp({ task: { ...task, initial: { ...task.initial, claimedDone: true } } }))
      .toThrow("unchanged catalog task");
  });
  it("changes only envelope metadata when an experiment declares an evaluation role", () => {
    const task = worldTasks({ seed: 1007 })[0]!;
    const training = makeWorldMdp({ task, horizon: 4 });
    const evaluation = makeWorldMdp({ task, horizon: 4, split: "eval" });
    expect(evaluation).toEqual({ ...training, split: "eval" });
    expect(task.split).toBe("train");
  });
});
