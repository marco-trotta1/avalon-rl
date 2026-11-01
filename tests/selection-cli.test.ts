import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSelection } from "../src/agent/selection-cli.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "avalon-selection-")); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

async function capture(args: string[]) {
  const output: string[] = [];
  const errors: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(value => { output.push(String(value)); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(value => { errors.push(String(value)); return true; });
  try { return { code: await runSelection(args), output: output.join(""), error: errors.join("") }; }
  finally { stdout.mockRestore(); stderr.mockRestore(); }
}

async function inputs(count = 1000) {
  const sampleIds = Array.from({ length: count }, (_, index) => String(index));
  const candidates = [{ id: "random", artifactSha256: "a".repeat(64) }, { id: "trained", artifactSha256: "b".repeat(64) }];
  const planText = JSON.stringify({
    format: "avalon-selection-plan-v1", baselineId: "random",
    metric: { name: "return", lower: 0, upper: 1, direction: "maximize" }, delta: 0.05, minImprovement: 0,
    sampling: { unit: "episode", assumption: "independent", seed: 7, sampleIds }, candidates,
  }) + "\n";
  await writeFile(join(root, "plan.json"), planText);
  await writeFile(join(root, "scores.json"), JSON.stringify({
    format: "avalon-selection-scores-v1", planSha256: createHash("sha256").update(planText).digest("hex"),
    candidates: candidates.map((candidate, index) => ({
      ...candidate, status: "complete", samples: sampleIds.map(sampleId => ({ sampleId, value: index })),
      latencyMs: 1, cost: { externalApiUsd: 0, computeUsd: null, hostAgentUsd: null },
    })),
  }));
  return ["--plan", join(root, "plan.json"), "--scores", join(root, "scores.json")];
}

describe("selection CLI", () => {
  it("writes a private report and preserves an existing output", async () => {
    const args = await inputs();
    const output = join(root, "report.json");
    const result = await capture([...args, "--out", output]);
    expect(result.code, result.error).toBe(0);
    const text = await readFile(output, "utf8");
    expect(JSON.parse(text)).toMatchObject({ decision: { status: "selected", candidateId: "trained" } });
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect((await capture([...args, "--out", output])).code).toBe(1);
    expect(await readFile(output, "utf8")).toBe(text);
  });

  it("returns code 5 with an inconclusive report", async () => {
    const result = await capture(await inputs(2));
    expect(result.code, result.error).toBe(5);
    expect(JSON.parse(result.output)).toMatchObject({ decision: { status: "inconclusive" } });
  });

  it("rejects a plan that changes after scores bind its bytes", async () => {
    const args = await inputs();
    await writeFile(join(root, "plan.json"), (await readFile(join(root, "plan.json"), "utf8")) + "\n");
    const result = await capture(args);
    expect(result.code).toBe(1);
    expect(result.error).toContain("exact selection plan bytes");
  });

  it("rejects a byte order mark instead of changing the hashed bytes", async () => {
    const args = await inputs();
    await writeFile(join(root, "plan.json"), "\ufeff" + await readFile(join(root, "plan.json"), "utf8"));
    const result = await capture(args);
    expect(result.code).toBe(1);
    expect(result.error).toContain("valid JSON");
  });

  it.each([[], ["--plan", "a"], ["--bad"], ["extra"], ["--plan", "a", "--plan", "b", "--scores", "c"]])("rejects invalid usage: %j", async (...args) => {
    expect((await capture(args)).code).toBe(2);
  });
});
