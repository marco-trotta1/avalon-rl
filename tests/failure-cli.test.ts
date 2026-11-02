import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoFailureCase, failureCaseHash, parseFailureCase } from "../src/failure/case.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const guard = fileURLToPath(new URL("./block-network.mjs", import.meta.url));
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "avalon-failure-cli-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", guard, entry, "failure", ...args], { encoding: "utf8" });
}
async function input(name: string, value: unknown) {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  return path;
}

describe("failure CLI without network access", () => {
  it("captures the demo privately and preserves existing output", async () => {
    const demo = run(["demo"]);
    expect(demo.status, demo.stderr).toBe(0);
    const source = await input("source.json", JSON.parse(demo.stdout));
    const output = join(directory, "captured.json");
    const captured = run(["capture", "--data", source, "--out", output]);
    expect(captured.status, captured.stderr).toBe(0);
    expect(captured.stdout).toBe("");
    const bytes = await readFile(output, "utf8");
    expect(JSON.parse(bytes)).toEqual(demoFailureCase());
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(run(["capture", "--data", source, "--out", output]).status).toBe(1);
    expect(await readFile(output, "utf8")).toBe(bytes);
  });

  it("distinguishes a reproducible failure from unresolved evidence", async () => {
    const failure = demoFailureCase();
    const source = await input("case.json", failure);
    const result = run(["replay", "--data", source]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "reproducible", observed: { status: "fail" }, reference: { status: "pass" } });
    const unresolved = await input("unresolved.json", { ...failure, files: { ...failure.files, observed: failure.files.reference } });
    const rejected = run(["replay", "--data", unresolved]);
    expect(rejected.status).toBe(5);
    expect(JSON.parse(rejected.stdout)).toMatchObject({ status: "unresolved" });
  });

  it("creates an initial environment and grades a real file repair", async () => {
    const failure = demoFailureCase();
    const source = await input("case.json", failure);
    const environment = join(directory, "workspace");
    const created = run(["environment", "--data", source, "--directory", environment]);
    expect(created.status, created.stderr).toBe(0);
    expect((await stat(environment)).mode & 0o777).toBe(0o700);
    const before = run(["grade", "--data", source, "--directory", environment]);
    expect(before.status, before.stderr).toBe(4);
    for (const [path, content] of Object.entries(failure.files.reference)) await writeFile(join(environment, path), content);
    const after = run(["grade", "--data", source, "--directory", environment]);
    expect(after.status, after.stderr).toBe(0);
    expect(JSON.parse(after.stdout)).toMatchObject({ status: "pass", caseHash: failureCaseHash(failure) });
    expect(run(["environment", "--data", source, "--directory", environment]).status).toBe(1);
    expect(await readFile(join(environment, "src/add.ts"), "utf8")).toBe(failure.files.reference["src/add.ts"]);
  });

  it("packages only reviewed cases with the required rights", async () => {
    const privateCase = demoFailureCase();
    const authorized = parseFailureCase({ ...privateCase, rights: {
      status: "authorized", owner: "Example owner", allowedUses: ["evaluation"], attestedAt: "2026-11-01T00:00:00Z",
    } });
    for (const [label, failure, status] of [["private", privateCase, 5], ["authorized", authorized, 0]] as const) {
      const source = await input(`${label}.json`, failure);
      const review = await input(`${label}-review.json`, {
        caseHash: failureCaseHash(failure), reviewer: "Example reviewer", reviewedAt: "2026-11-01T01:00:00Z",
        privacyApproved: true, checksApproved: true,
      });
      const output = join(directory, `${label}-package.json`);
      const result = run(["package", "--data", source, "--use", "evaluation", "--review", review, "--out", output]);
      expect(result.status, result.stderr).toBe(status);
      expect(result.stdout).toBe("");
      const bytes = await readFile(output, "utf8");
      expect((await stat(output)).mode & 0o777).toBe(0o600);
      if (label === "private") {
        expect(JSON.parse(bytes)).toEqual({ status: "blocked", reasons: ["rights-private"] });
        expect(bytes).not.toContain(privateCase.description);
      } else expect(JSON.parse(bytes)).toMatchObject({ status: "ready", package: { caseHash: failureCaseHash(failure) } });
    }
  });

  it("compares paired candidates with separate families", async () => {
    const failure = demoFailureCase();
    const holdout = parseFailureCase({
      ...failure, id: "holdout-case", familyId: "holdout-family",
      files: { ...failure.files, initial: {
        ...failure.files.initial, "src/add.ts": "export const add = (a: number, b: number) => a * b;\n",
      } },
    });
    const cases = await input("cases.json", [failure, holdout]);
    const candidates = await input("candidates.json", [failure, holdout].map(item => ({ id: item.id, files: item.files.reference })));
    const split = await input("split.json", { developmentFamilyIds: [failure.familyId], holdoutFamilyIds: [holdout.familyId] });
    const result = run(["compare", "--data", cases, "--candidates", candidates, "--split", split]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { cases: 2, baselinePassed: 0, candidatePassed: 2, improved: 2, regressed: 0, unresolved: 0 },
      rows: [{ split: "development" }, { split: "holdout" }],
    });
    const invalid = await input("invalid-split.json", { developmentFamilyIds: [failure.familyId], holdoutFamilyIds: [failure.familyId] });
    expect(run(["compare", "--data", cases, "--candidates", candidates, "--split", invalid]).status).toBe(1);
  });

  it("does not disclose malformed input content in errors", async () => {
    const secret = "private-content-do-not-print";
    const source = await input("bad.json", { format: secret });
    const result = run(["capture", "--data", source, "--out", join(directory, "out.json")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr).toContain("Check the input format");
  });

  it("rejects unsupported and incomplete command options", () => {
    for (const args of [["capture"], ["invalid"], ["demo", "--use", "training"], ["demo", "--out", "a", "--out", "b"]]) {
      const result = run(args);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
    }
    expect(run(["--help"]).stdout).toContain("failure capture");
  });
});
