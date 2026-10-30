import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoPair } from "../src/lab/demo.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const guard = fileURLToPath(new URL("./block-network.mjs", import.meta.url));
let directory: string;
function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", guard, entry, ...args], { encoding: "utf8", timeout: 10_000 });
}
beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "avalon-wave2-cli-")); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("research laboratory commands", () => {
  it("returns separate match, mismatch, and missing-evidence codes", async () => {
    const data = join(directory, "experience.json");
    const contract = join(directory, "contract.json");
    await writeFile(data, JSON.stringify(demoPair({ fault: "none" }).source));
    for (const [path, expected, code] of [["count", 2, 0], ["count", 3, 4], ["absent", 2, 5]] as const) {
      await writeFile(contract, JSON.stringify({ format: "avalon.trace-contract/v1", name: "counter", rules: [
        { id: "outcome", kind: "final-equals", path: [path], expected },
      ] }));
      const result = run(["trace-audit", "--data", data, "--contract", contract]);
      expect(result.status, result.stderr).toBe(code);
      expect(result.stdout).not.toContain("counter-7");
      expect(result.stdout).not.toContain('"observation"');
    }
  });
  it("exports a bounded reducer table to a new private file", async () => {
    const out = join(directory, "mdp.json");
    expect(run(["world-mdp", "--task", "settle-a", "--horizon", "3", "--out", out]).status).toBe(0);
    expect(JSON.parse(await readFile(out, "utf8"))).toMatchObject({ format: "avalon.mdp/v1", horizon: 3, task: { id: "settle-a" } });
    expect((await stat(out)).mode & 0o777).toBe(0o600);
    expect(run(["world-mdp", "--out", out]).status).toBe(1);
    expect(run(["world-mdp", "--horizon", "0"]).status).toBe(2);
    expect(run(["world-mdp", "--task", "unknown"]).status).toBe(2);
  });
  it("writes a selected raw trace witness only to a new private path", async () => {
    const data = join(directory, "witness-source.json");
    const contract = join(directory, "witness-contract.json");
    const out = join(directory, "trace-witness.json");
    await writeFile(data, JSON.stringify(demoPair({ fault: "none" }).source));
    await writeFile(contract, JSON.stringify({ format: "avalon.trace-contract/v1", name: "counter", rules: [
      { id: "outcome", kind: "final-equals", path: ["count"], expected: 3 },
    ] }));
    const args = ["trace-witness", "--data", data, "--contract", contract];
    expect(run(args).status).toBe(2);
    expect(run([...args, "--out", out]).status).toBe(0);
    expect(JSON.parse(await readFile(out, "utf8"))).toMatchObject({ format: "avalon.trace-witness/v1", private: true });
    expect((await stat(out)).mode & 0o777).toBe(0o600);
    expect(run([...args, "--out", out]).status).toBe(1);
  });
  it("runs the packaged pair and holdout examples without network access", () => {
    expect(run(["trace-pair", "--source", "examples/traces/snapshot.json", "--target", "examples/traces/paired-snapshot.json",
      "--contract", "examples/traces/pair-contract.json"]).status).toBe(0);
    expect(run(["trace-holdout", "--data", "examples/traces/holdout.json"]).status).toBe(0);
    expect(run(["trace-benchmark", "--repetitions", "1"]).status).toBe(0);
  });
});
