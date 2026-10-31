import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSnapshot } from "../src/lab/contract.js";
import { parseTraceContract } from "../src/trace/contract.js";
import { auditTraceContract } from "../src/trace/audit.js";
import { parseTracePairContract, auditTracePair } from "../src/trace/pair.js";
import { parseTraceHoldout, auditTraceHoldout } from "../src/trace/holdout.js";

function example(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../examples/traces/${name}`, import.meta.url), "utf8"));
}
describe("runnable trace examples", () => {
  it("shows why a final-state match does not establish permitted history", () => {
    const snapshot = parseSnapshot(example("snapshot.json"));
    expect(auditTraceContract({ snapshot, contract: parseTraceContract(example("contract.json")) }).status).toBe("match");
    expect(auditTraceContract({ snapshot, contract: parseTraceContract(example("history-contract.json")) }).status).toBe("mismatch");
  });
  it("keeps the declared renaming and illustrative holdout consistent", () => {
    expect(auditTracePair({ source: parseSnapshot(example("snapshot.json")), target: parseSnapshot(example("paired-snapshot.json")),
      contract: parseTracePairContract(example("pair-contract.json")) }).status).toBe("match");
    expect(auditTraceHoldout({ manifest: parseTraceHoldout(example("holdout.json")) }).status).toBe("match");
  });
});
