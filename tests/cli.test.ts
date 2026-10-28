import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoCase, demoData } from "../src/lib/demo.js";
import { MAX_FILE_BYTES, parseCase } from "../src/lib/schema.js";
import type { Analysis, Estimate } from "../src/lib/engine.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const networkGuard = fileURLToPath(new URL("./block-network.mjs", import.meta.url));
let directory: string;
type Report = {
  analysis: Analysis;
  estimate: Estimate;
  format: string;
  scope: { rights: { type: string } };
  comparableDecisions: { record: number }[];
};

function run(args: string[], blockNetwork = false) {
  const prefix = blockNetwork ? ["--import", networkGuard] : [];
  return spawnSync(process.execPath, [...prefix, entry, ...args], { encoding: "utf8" });
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "traceatlas-cli-"));
  for (const kind of ["traces", "environment"] as const) {
    await writeFile(join(directory, `${kind}-case.json`), JSON.stringify(demoCase(kind)), { mode: 0o600 });
    await writeFile(join(directory, `${kind}-data`), demoData(kind), { mode: 0o600 });
  }
});

afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("command-line workflow", () => {
  it("prints help without starting a server", () => {
    const result = run(["--help"], true);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("appraise");
    expect(result.stderr).toBe("");
  });

  it.each([
    { kind: "traces", expectedPrice: 15_000 },
    { kind: "environment", expectedPrice: 13_200 },
  ])("appraises $kind from local inputs without network access", ({ kind, expectedPrice }) => {
    const result = run(["appraise", "--case", join(directory, `${kind}-case.json`), "--data", join(directory, `${kind}-data`)], true);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report: Report = JSON.parse(result.stdout);
    expect(report.format).toBe("traceatlas-aggregate-v1");
    expect(report.comparableDecisions.map(decision => decision.record)).toEqual([5, 4, 3, 2, 1]);
    expect(report.estimate.status).toBe("estimated");
    if (report.estimate.status === "estimated") expect(report.estimate.medianUsd).toBeCloseTo(expectedPrice, 6);
    for (const privateText of ["Software operations", "Synthetic deal", "Synthetic buyer", '"observations":', '"actions":']) {
      expect(result.stdout).not.toContain(privateText);
    }
  });

  it("appraises an ownership sale using matching sale evidence", async () => {
    const original = demoCase("traces");
    const rights = { type: "assignment" } as const;
    const appraisal = {
      ...original, asset: { ...original.asset, rights },
      comparables: original.comparables.map(deal => ({ ...deal, rights })),
    };
    const path = join(directory, "sale-case.json");
    await writeFile(path, JSON.stringify(appraisal));
    const result = run(["appraise", "--case", path, "--data", join(directory, "traces-data")], true);
    expect(result.status).toBe(0);
    const report: Report = JSON.parse(result.stdout);
    expect(report.scope.rights).toEqual({ type: "assignment" });
    expect(report.estimate.status).toBe("estimated");
    if (report.estimate.status === "estimated") expect(report.estimate.medianUsd).toBeCloseTo(15_000, 6);
  });

  it("inspects data without a deal ledger or price", () => {
    const result = run(["inspect", "--kind", "traces", "--data", join(directory, "traces-data")], true);
    expect(result.status).toBe(0);
    const report: { analysis: Analysis; estimate?: unknown } = JSON.parse(result.stdout);
    expect(report.analysis.eligibleUnits).toBe(240);
    expect(report.estimate).toBeUndefined();
  });

  it("uses exit code 3 and a structured report when pricing evidence is missing", async () => {
    const appraisal = { ...demoCase("traces"), comparables: [] };
    const path = join(directory, "missing-evidence.json");
    await writeFile(path, JSON.stringify(appraisal));
    const result = run(["appraise", "--case", path, "--data", join(directory, "traces-data")]);
    expect(result.status).toBe(3);
    const report: Report = JSON.parse(result.stdout);
    expect(report.estimate.status).toBe("withheld");
    expect(report.estimate).not.toHaveProperty("medianUsd");
  });

  it("writes an owner-only report and refuses to replace an existing file", async () => {
    const path = join(directory, "report.json");
    const args = ["appraise", "--case", join(directory, "traces-case.json"), "--data", join(directory, "traces-data"), "--out", path];
    const first = run(args);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe("");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const saved = await readFile(path, "utf8");
    const second = run(args);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("already exists");
    expect(await readFile(path, "utf8")).toBe(saved);
  });

  it("rejects an output path that names an input file", async () => {
    const path = join(directory, "traces-data");
    const original = await readFile(path, "utf8");
    const result = run(["inspect", "--kind", "traces", "--data", path, "--out", path]);
    expect(result.status).toBe(1);
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it.each([
    ["appraise", "--data", "missing"],
    ["inspect", "--kind", "unknown", "--data", "missing"],
    ["demo", "--out", "one", "--out", "two"],
    ["demo", "--case", "missing"],
  ])("rejects invalid arguments: %j", (...args) => {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage");
  });

  it("rejects unreadable, oversized, and invalid UTF-8 inputs without copying payloads to stderr", async () => {
    const invalid = join(directory, "invalid-utf8");
    const oversized = join(directory, "oversized");
    await writeFile(invalid, Buffer.from([0xff, 0xfe, 0xff]));
    await writeFile(oversized, Buffer.alloc(MAX_FILE_BYTES + 1, 32));
    for (const path of [invalid, oversized, join(directory, "absent")]) {
      const result = run(["inspect", "--kind", "traces", "--data", path]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(directory);
    }
  });

  it("prints a blank template and an explicitly synthetic demo", () => {
    const template = run(["template", "--kind", "environment"]);
    expect(template.status).toBe(0);
    expect(parseCase(template.stdout).asset.kind).toBe("environment");
    const demonstration = run(["demo", "--kind", "traces"], true);
    expect(demonstration.status).toBe(0);
    const report: Report = JSON.parse(demonstration.stdout);
    expect(report.estimate.mode).toBe("synthetic");
  });
});
