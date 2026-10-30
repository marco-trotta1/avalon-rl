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
  let stop: ReplayReceipt["stop"] = state.terminated ? "terminated" : "actions-exhausted";
  for (const action of options.actions) {
    if (state.terminated) break;
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
}>;
export function compareReplay(options: { expected: ReplayReceipt; actual: ReplayReceipt }): ReplayDivergence {
  const expected = [options.expected.initialHash, ...options.expected.transitions.map(worldHash)];
  const actual = [options.actual.initialHash, ...options.actual.transitions.map(worldHash)];
  for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
    if (expected[index] !== actual[index]) return {
      matches: false, firstIndex: index - 1, expected: expected[index] ?? null, actual: actual[index] ?? null,
    };
  }
  return { matches: true, firstIndex: null, expected: null, actual: null };
}
