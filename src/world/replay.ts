import { createHash } from "node:crypto";
import { z } from "zod";
import { stepWorld, type WorldAction, type WorldState, type WorldTransition } from "./state.js";

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  throw new Error("The hash input must contain finite JSON values.");
}
export function worldHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export type ReplayReceipt = Readonly<{
  initialHash: string;
  transitions: readonly WorldTransition[];
  stateHashes: readonly string[];
  final: WorldState;
  stop: "terminated" | "truncated" | "actions-exhausted";
}>;
export function replayWorld(options: {
  initial: WorldState; actions: readonly WorldAction[]; maxSteps?: number;
}): ReplayReceipt {
  const maxSteps = z.number().int().min(1).max(10_000).parse(options.maxSteps ?? 128);
  const transitions: WorldTransition[] = [];
  const stateHashes: string[] = [];
  let state = options.initial;
  let stop: ReplayReceipt["stop"] = state.truncated ? "truncated" : state.terminated ? "terminated" : "actions-exhausted";
  for (const action of options.actions) {
    if (state.status !== "active") break;
    const transition = stepWorld({ state, action, truncate: transitions.length + 1 >= maxSteps });
    transitions.push(transition);
    state = transition.nextObservation;
    stateHashes.push(worldHash(state));
    if (transition.truncated) { stop = "truncated"; break; }
    if (transition.terminated) { stop = "terminated"; break; }
  }
  return { initialHash: worldHash(options.initial), transitions, stateHashes, final: state, stop };
}
export type ReplayDivergence = Readonly<{
  matches: boolean; firstIndex: number | null; expected: string | null; actual: string | null;
  component: "initial" | "transition" | "summary" | null;
}>;
export function compareReplay(options: { expected: ReplayReceipt; actual: ReplayReceipt }): ReplayDivergence {
  const { expected, actual } = options;
  if (expected.initialHash !== actual.initialHash) return {
    matches: false, component: "initial", firstIndex: -1,
    expected: expected.initialHash, actual: actual.initialHash,
  };
  const count = Math.max(expected.transitions.length, actual.transitions.length, expected.stateHashes.length, actual.stateHashes.length);
  for (let index = 0; index < count; index++) {
    const expectedHash = worldHash({ transition: expected.transitions[index] ?? null, stateHash: expected.stateHashes[index] ?? null });
    const actualHash = worldHash({ transition: actual.transitions[index] ?? null, stateHash: actual.stateHashes[index] ?? null });
    if (expectedHash !== actualHash) return {
      matches: false, component: "transition", firstIndex: index, expected: expectedHash, actual: actualHash,
    };
  }
  const expectedSummary = worldHash({ final: expected.final, stop: expected.stop });
  const actualSummary = worldHash({ final: actual.final, stop: actual.stop });
  if (expectedSummary !== actualSummary) return {
    matches: false, component: "summary", firstIndex: Math.max(expected.transitions.length, actual.transitions.length) - 1,
    expected: expectedSummary, actual: actualSummary,
  };
  return { matches: true, component: null, firstIndex: null, expected: null, actual: null };
}
