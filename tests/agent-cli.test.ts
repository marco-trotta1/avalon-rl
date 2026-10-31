import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent/cli.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "avalon-agent-cli-")); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

async function run(args: string[]) {
  const output: string[] = [];
  const errors: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(value => { output.push(String(value)); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(value => { errors.push(String(value)); return true; });
  try { return { code: await runAgent(args), output: output.join(""), error: errors.join("") }; }
  finally { stdout.mockRestore(); stderr.mockRestore(); }
}

function runIdentifier(text: string): string {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || !("runId" in data) || typeof data.runId !== "string") throw new Error("Missing run identifier.");
  return data.runId;
}

describe("the agent CLI boundary", () => {
  it("lists all registered commands and keeps doctor read-only", async () => {
    const catalog = await run(["commands", "--json"]);
    expect(catalog.code).toBe(0);
    expect(catalog.output.match(/"invocation":/g)).toHaveLength(20);
    expect(catalog.output).toContain('"invocation": "/rl-credit"');
    expect((await run(["doctor", "--project", root])).code).toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("executes the lifecycle through parsed CLI arguments", async () => {
    await writeFile(join(root, "source.txt"), "A source snapshot.\n");
    const initial = await run(["start", "/rl-data", "--project", root, "--goal", "Check the source.", "--input", "source.txt"]);
    expect(initial.code, initial.error).toBe(0);
    const id = runIdentifier(initial.output);
    const insufficient = await run(["finish", id, "--project", root, "--status", "complete", "--summary", "Done."]);
    expect(insufficient.code).toBe(1);
    expect(insufficient.error).toContain("artifact-backed evidence");
    await writeFile(join(root, "receipt.txt"), "The actual audit reports no divergence.\n");
    expect((await run(["record", id, "--project", root, "--kind", "evidence", "--message", "The audit completes.", "--artifact", "receipt.txt"])).code).toBe(0);
    const finished = await run(["finish", id, "--project", root, "--status", "complete", "--summary", "The audit executes with the recorded inputs."]);
    expect(finished.code, finished.error).toBe(0);
    expect((await run(["resume", id, "--project", root])).output).toContain('"status": "complete"');
    expect(await readFile(join(root, ".avalon", ".gitignore"), "utf8")).toBe("*\n");
  });

  it.each([
    ["doctor", "extra"], ["doctor", "--json"], ["commands", "--project", "."],
    ["init", "--project", ".", "--project", "."], ["start", "rl-data"],
    ["record", "id", "--kind", "unsupported", "--message", "Text"],
    ["finish", "id", "--status", "unknown", "--summary", "Text"],
    ["install", "--host", "unknown", "--project", "."], ["unknown"],
  ])("rejects unsupported or ambiguous arguments: %s", async (...args) => {
    const result = await run(args.concat(["--project", root]));
    expect(result.code).not.toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("documents completion and privacy limits in help", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("host-reported execution");
    expect(result.output).toContain("256 MiB");
  });

  it.each(["cursor", "claude", "codex"])("installs the actual module-relative bundle through the CLI for %s", async host => {
    const preview = await run(["install", "--host", host, "--project", root, "--dry-run"]);
    expect(preview.code, preview.error).toBe(0);
    expect(await readdir(root)).toEqual([]);
    const installed = await run(["install", "--host", host, "--project", root]);
    expect(installed.code, installed.error).toBe(0);
    expect(installed.output).toContain('"commands": 20');
    const directory = host === "codex" ? ".agents" : `.${host}`;
    expect(await readFile(join(root, directory, "skills", "rl-train", "SKILL.md"), "utf8")).toContain("name: rl-train");
    expect(await readFile(join(root, directory, "skills", "_shared", "workflow.md"), "utf8")).toMatch(/workflow protocol/i);
    const repeated = await run(["install", "--host", host, "--project", root]);
    expect(repeated.code, repeated.error).toBe(0);
    expect(repeated.output).toContain('"status": "unchanged"');
  });
});
