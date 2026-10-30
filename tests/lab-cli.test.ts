import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoPair } from "../src/lab/demo.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const guard = fileURLToPath(new URL("./block-network.mjs", import.meta.url));
let directory: string;
function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", guard, entry, ...args], { encoding: "utf8" });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "avalon-lab-cli-"));
  const { source, target } = demoPair({ fault: "reward-shift" });
  await writeFile(join(directory, "source.json"), JSON.stringify(source));
  await writeFile(join(directory, "target.json"), JSON.stringify(target));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("laboratory commands", () => {
  it("compares local stages and returns a failing audit code", () => {
    const result = run(["audit", "--source", join(directory, "source.json"), "--target", join(directory, "target.json")]);
    expect(result.status).toBe(4);
    const report = JSON.parse(result.stdout) as { format: string; status: string; findings: { field: string }[] };
    expect(report.format).toBe("avalon.audit/v1");
    expect(report.findings.some(finding => finding.field === "reward")).toBe(true);
    expect(result.stdout).not.toContain('"observations"');
    expect(result.stdout).not.toContain('"count"');
  });
  it("summarizes a snapshot without its private observations", () => {
    const result = run(["snapshot", "--data", join(directory, "source.json")]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ episodes: 1, transitions: 2 });
    expect(result.stdout).not.toContain("counter-7");
  });
  it("renders an offline HTML report through the CLI", () => {
    const result = run(["lab-demo", "--format", "html"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<!doctype html>");
    expect(result.stdout).toContain("Experience changed.");
    expect(run(["lab-demo", "--format", "unknown"]).status).toBe(2);
  });
  it.each(["none", "reward-shift", "collapsed-ending"])("runs a labeled %s demonstration without network access", fault => {
    const result = run(["lab-demo", "--fault", fault]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ evidence: "synthetic", status: fault === "none" ? "pass" : "fail", demonstration: { injectedFault: fault } });
  });
  it("creates private output and refuses existing files and symlinks", async () => {
    const path = join(directory, "audit.json");
    expect(run(["lab-demo", "--out", path]).status).toBe(0);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const original = await readFile(path, "utf8");
    expect(run(["lab-demo", "--out", path]).status).toBe(1);
    const link = join(directory, "report-link");
    await symlink(path, link);
    expect(run(["lab-demo", "--out", link]).status).toBe(1);
    expect(await readFile(path, "utf8")).toBe(original);
  });
  it.each([
    ["audit"], ["snapshot"], ["lab-demo", "--fault", "unknown"],
    ["lab-demo", "--out", "one", "--out", "two"], ["snapshot", "--source", "missing"],
  ])("rejects unsupported command options %j", (...args) => {
    expect(run(args).status).toBe(2);
  });
  it("keeps malformed payloads and file paths out of errors", async () => {
    const path = join(directory, "private-payload.json");
    await writeFile(path, '{"secret":"do-not-print"');
    const result = run(["snapshot", "--data", path]);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("do-not-print");
    expect(result.stderr).not.toContain(directory);
  });
});
