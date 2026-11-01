import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { runAgent } from "../src/agent/cli.js";
import { COMMAND_NAMES } from "../src/agent/catalog.js";

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
    expect(catalog.output.match(/"invocation":/g)).toHaveLength(COMMAND_NAMES.length);
    expect(catalog.output).toContain('"invocation": "/rl-credit"');
    expect((await run(["doctor", "--project", root])).code).toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("lists saved runs without initializing an empty project", async () => {
    const empty = await run(["runs", "--project", root]);
    expect(empty.code, empty.error).toBe(0);
    expect(JSON.parse(empty.output)).toMatchObject({ state: "absent", total: 0, runs: [] });
    expect(await readdir(root)).toEqual([]);
    const initial = await run(["start", "rl-data", "--goal", "Check the source.", "--project", root]);
    const listed = await run(["runs", "--project", root, "--limit", "1"]);
    expect(listed.code, listed.error).toBe(0);
    expect(JSON.parse(listed.output)).toMatchObject({
      total: 1, limit: 1, runs: [{ runId: runIdentifier(initial.output), integrity: "valid", status: "planned" }],
    });
  });

  it.each(["0", "101", "1.5", "1e1", "01", "", "-1"])("rejects the invalid run limit %j without writes", async limit => {
    const result = await run(["runs", "--project", root, `--limit=${limit}`]);
    expect(result.code).toBe(2);
    expect(result.error).toContain("run limit");
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
    expect(installed.output).toContain(`"commands": ${COMMAND_NAMES.length}`);
    const directory = host === "codex" ? ".agents" : `.${host}`;
    expect(await readFile(join(root, directory, "skills", "rl-train", "SKILL.md"), "utf8")).toContain("name: rl-train");
    expect(await readFile(join(root, directory, "skills", "_shared", "workflow.md"), "utf8")).toMatch(/workflow protocol/i);
    const repeated = await run(["install", "--host", host, "--project", root]);
    expect(repeated.code, repeated.error).toBe(0);
    expect(repeated.output).toContain('"status": "unchanged"');
  });

  it.each(["cursor", "claude", "codex"])("installs for %s in the current project without a global runtime", async host => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "../dist/cli.js"), "install", host], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const installed: unknown = JSON.parse(result.stdout);
    if (typeof installed !== "object" || installed === null || !("runtime" in installed)) throw new Error("Missing installed runtime.");
    const runtime = installed.runtime;
    if (typeof runtime !== "object" || runtime === null || !("entrypoint" in runtime) || typeof runtime.entrypoint !== "string") throw new Error("Missing runtime entrypoint.");
    const executable = join(root, runtime.entrypoint);
    const catalog = spawnSync(process.execPath, [executable, "agent", "commands", "--json"], { cwd: dirname(root), encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } });
    expect(catalog.status, catalog.stderr).toBe(0);
    expect(catalog.stdout.match(/"invocation":/g)).toHaveLength(COMMAND_NAMES.length);
    const audit = spawnSync(process.execPath, [executable, "lab-demo", "--fault", "none"], { cwd: dirname(root), encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } });
    expect(audit.status, audit.stderr).toBe(0);
  });

  it("installs a runtime without duplicate host skills and previews without writes", async () => {
    const preview = await run(["install", "--runtime-only", "--project", root, "--dry-run"]);
    expect(preview.code, preview.error).toBe(0);
    expect(await readdir(root)).toEqual([]);
    const result = await run(["install", "--runtime-only", "--project", root]);
    expect(result.code, result.error).toBe(0);
    expect(await readdir(root)).toEqual([".avalon"]);
    expect((await run(["install", "--runtime-only", "--project", root])).output).toContain('"status": "unchanged"');
    expect((await run(["install", "codex", "--runtime-only", "--project", root])).code).toBe(2);
    expect((await run(["install", "codex", "--host", "claude", "--project", root])).code).toBe(2);
  });

  it("upgrades the untouched 0.5 protocol and preserves a locally edited protocol", async () => {
    const old = await readFile(join(import.meta.dirname, "fixtures/agent-workflow-v0.5.0.md"), "utf8");
    const args = ["install", "codex", "--project", root];
    expect((await run(args)).code).toBe(0);
    const protocol = join(root, ".agents/skills/_shared/workflow.md");
    await writeFile(protocol, old);
    const upgraded = await run(args);
    expect(upgraded.code, upgraded.error).toBe(0);
    expect(upgraded.output).toContain('"updatedFiles": 1');
    const runtime: { runtime: { entrypoint: string } } = JSON.parse(upgraded.output);
    expect(await readFile(protocol, "utf8")).toContain(runtime.runtime.entrypoint);
    await writeFile(protocol, old + "Keep the local customization.\n");
    expect((await run(args)).code).toBe(1);
    expect(await readFile(protocol, "utf8")).toBe(old + "Keep the local customization.\n");
  });

  it.each(["", "   "])("rejects an explicit blank project before creating files", project => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "../dist/cli.js"), "install", "codex", "--project", project], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(2);
    return expect(readdir(root)).resolves.toEqual([]);
  });
});
