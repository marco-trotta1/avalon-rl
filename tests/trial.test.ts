import { readFileSync } from "node:fs";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTrial, runTrial } from "../src/trial/run.js";
import { runTrialCli } from "../src/trial/cli.js";
import { verifyTraceWitness } from "../src/trace/witness.js";

const fixturePath = new URL("../examples/team-trial/trial.json", import.meta.url);
const fixture = () => JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

describe("team trial", () => {
  it("compares the same evidence and preserves replayable failures", () => {
    const trial = parseTrial(fixture());
    const report = runTrial(trial);
    expect(report.comparisons[1]).toMatchObject({
      baseline: { samples: 4, agreements: 1, falseAccepts: 2, acceptedWithoutEvidence: 1 },
      avalon: { samples: 4, agreements: 4, falseAccepts: 0, unknowns: 1 },
    });
    expect(report.comparisons.filter(item => item.split === "holdout").every(item => item.avalon.samples === 0)).toBe(true);
    for (const [index, result] of report.cases.entries()) {
      if (result.witness) expect(verifyTraceWitness({ witness: result.witness,
        sourceSnapshot: trial.cases[index]!.snapshot, sourceContract: trial.cases[index]!.contract })).toBe(true);
    }
  });
  it("rejects absent authorization, false provenance, and split leakage", () => {
    const trial = parseTrial(fixture());
    expect(() => parseTrial({ ...trial, authorization: { ...trial.authorization, localUseApproved: false } })).toThrow();
    expect(() => parseTrial({ ...trial, cases: [{ ...trial.cases[0], origin: "observed" }] })).toThrow(/user-supplied/);
    expect(() => parseTrial({ ...trial, cases: [trial.cases[0], { ...trial.cases[1], group: trial.cases[0]!.group, split: "holdout" }] })).toThrow(/one split/);
    expect(() => parseTrial({ ...trial, cases: [trial.cases[0], trial.cases[0]] })).toThrow(/unique/);
  });
  it("keeps missing evidence unknown and records changed expectations", () => {
    const trial = parseTrial(fixture());
    trial.cases[0]!.expected = "mismatch";
    const report = runTrial(trial);
    expect(report.comparisons[1]!.avalon.falseAccepts).toBe(1);
    expect(report.cases[3]!.avalon.status).toBe("unknown");
    expect(report.cases[3]!.execution).toBeNull();
  });
  it("writes a private report without replacing an existing file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avalon-trial-"));
    const out = join(directory, "report.json");
    const args = ["--data", fileURLToPath(fixturePath), "--out", out];
    expect(await runTrialCli(args)).toBe(5);
    const original = await readFile(out, "utf8");
    expect((await stat(out)).mode & 0o777).toBe(0o600);
    expect(await runTrialCli(args)).toBe(1);
    expect(await readFile(out, "utf8")).toBe(original);
  });
});
