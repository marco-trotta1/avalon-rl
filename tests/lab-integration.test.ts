import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoPair } from "../src/lab/demo.js";
import { contentHash } from "../src/audit/engine.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const guard = fileURLToPath(new URL("./block-network.mjs", import.meta.url));
let directory: string;
const run = (args: string[]) => spawnSync(process.execPath, ["--import", guard, entry, ...args], { encoding: "utf8" });
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "avalon-integrated-"));
  const { source, target } = demoPair({ fault: "none" });
  const recorded = { ...source, stage: "recorded" };
  for (const [name, snapshot] of Object.entries({ source, recorded, target })) await writeFile(join(directory, `${name}.json`), JSON.stringify(snapshot));
  await writeFile(join(directory, "links.json"), JSON.stringify([
    { parentSha256: contentHash(source), childSha256: contentHash(recorded) },
    { parentSha256: contentHash(recorded), childSha256: contentHash(target) },
  ]));
  await writeFile(join(directory, "fault.json"), JSON.stringify(demoPair({ fault: "reward-shift" }).target));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
describe("complete laboratory CLI", () => {
  it("keeps missing lineage inconclusive and validates explicit hash links", () => {
    const args = ["pipeline", "--source", join(directory, "source.json"), "--recorded", join(directory, "recorded.json"), "--target", join(directory, "target.json")];
    expect(run(args).status).toBe(5);
    const bound = run([...args, "--lineage", join(directory, "links.json")]);
    expect(bound.status).toBe(0);
    expect(JSON.parse(bound.stdout)).toMatchObject({ format: "avalon.pipeline-audit/v1", status: "pass" });
  });
  it("saves a private witness that reproduces a selected fault", async () => {
    const args = ["witness", "--source", join(directory, "source.json"), "--target", join(directory, "fault.json")];
    expect(run(args).status).toBe(2);
    const output = join(directory, "witness.json");
    expect(run([...args, "--out", output]).status).toBe(0);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ privacy: "private-evidence", report: { status: "fail" } });
  });
  it("finds exact content overlap across declared splits", () => {
    expect(run(["contamination", "--source", join(directory, "source.json"), "--target", join(directory, "target.json")]).status).toBe(4);
  });
  it.each([
    ["world-demo", "avalon.world/v1"], ["world-challenge", "avalon.world-challenge/v1"],
    ["world-search", "avalon.world-search/v1"], ["world-benchmark", "avalon.world-benchmark/v1"],
    ["world-curriculum", "avalon.world-curriculum/v1"], ["world-export", "avalon.snapshot/v1"],
  ])("runs %s locally with no network", (command, format) => {
    const result = run([command]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ format, evidence: "synthetic" });
  });
  it("executes a user-authored plan and separates reward from outcome", async () => {
    const path = join(directory, "plan.json");
    await writeFile(path, JSON.stringify({ task: "settle-a", actions: [{ type: "claim-done" }, { type: "finish" }] }));
    const result = run(["world-run", "--data", path]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ weak: { accepted: true }, oracle: { accepted: false } });
    expect(run(["world-search", "--depth", "100"]).status).toBe(2);
    expect(run(["world-curriculum", "--budget", "0"]).status).toBe(2);
  });
});
