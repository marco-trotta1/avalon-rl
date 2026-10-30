import { describe, expect, it } from "vitest";
import { parseSnapshot } from "../src/lab/contract.js";
import { parseTraceContract } from "../src/trace/contract.js";
import { buildTraceWitness, verifyTraceWitness } from "../src/trace/witness.js";

describe("selected trace witnesses", () => {
  const snapshot = parseSnapshot({ format: "avalon.snapshot/v1", stage: "source", producer: { name: "fixture", version: "1" },
    seed: 7, evidence: "synthetic", episodes: [true, false].map((done, index) => ({ id: `private-${index}`, task: "task", steps: [{
      index: 0, observation: { done: false }, action: "finish", reward: 1, next_observation: { done }, terminated: true, truncated: false,
    }] })) });
  const contract = parseTraceContract({ format: "avalon.trace-contract/v1", name: "goal", rules: [
    { id: "goal", kind: "final-equals", path: ["done"], expected: true },
  ] });
  it("isolates the selected episode without changing its identity or finding", () => {
    const witness = buildTraceWitness({ snapshot, contract });
    expect(witness.private).toBe(true);
    expect(witness.selection.episode).toBe(2);
    expect(witness.snapshot.episodes.map(episode => episode.id)).toEqual(["private-1"]);
    expect(witness.reduction).toMatchObject({ episodesBefore: 2, episodesAfter: 1, stepMinimal: false });
    expect(verifyTraceWitness({ witness, sourceSnapshot: snapshot, sourceContract: contract })).toBe(true);
    expect(snapshot.episodes).toHaveLength(2);
  });
  it("rejects an identity switch even when the replacement has the same mismatch", () => {
    const witness = buildTraceWitness({ snapshot, contract, finding: 1 });
    const changed = { ...witness, snapshot: parseSnapshot({ ...witness.snapshot, episodes: [
      { ...witness.snapshot.episodes[0], id: "switched" },
    ] }) };
    expect(verifyTraceWitness({ witness: changed, sourceSnapshot: snapshot, sourceContract: contract })).toBe(false);
    expect(verifyTraceWitness({ witness, sourceSnapshot: changed.snapshot, sourceContract: contract })).toBe(false);
  });
  it("requires a real mismatching check with unambiguous evidence", () => {
    for (const finding of [0, -1, 0.5, 100]) expect(() => buildTraceWitness({ snapshot, contract, finding })).toThrow("mismatching check");
    const ambiguous = parseSnapshot({ ...snapshot, episodes: [snapshot.episodes[1], snapshot.episodes[1]] });
    expect(() => buildTraceWitness({ snapshot: ambiguous, contract })).toThrow("mismatching check");
  });
});
