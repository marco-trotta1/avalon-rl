import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMAND_NAMES } from "../src/agent/catalog.js";
import { installSkills } from "../src/agent/install.js";
import { MAX_JSON_BYTES, fingerprint, readBytes, withStateLock } from "../src/agent/io.js";
import { discoverProject, initProjectUnlocked } from "../src/agent/project.js";
import { finishRun, recordRun, resumeRun, startRun } from "../src/agent/runs.js";

let root: string;
let bundle: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "avalon-agent-runtime-"));
  bundle = await mkdtemp(join(tmpdir(), "avalon-agent-bundle-"));
  for (const name of COMMAND_NAMES) {
    await mkdir(join(bundle, "skills", name), { recursive: true });
    await writeFile(join(bundle, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: A workflow.\n---\nRun the actual checks.\n`);
  }
  await mkdir(join(bundle, "skills", "_shared"), { recursive: true });
  await writeFile(join(bundle, "skills", "_shared", "workflow.md"), "Execute and record the workflow.\n");
});
afterEach(async () => { await Promise.all([rm(root, { recursive: true, force: true }), rm(bundle, { recursive: true, force: true })]); });

async function start(inputs: string[] = []) {
  return withStateLock(root, () => startRun(root, { command: "rl-data", goal: "Check the experience boundary.", inputs }));
}

describe("private run records", () => {
  it("starts planned, protects the directory, and preserves an existing profile", async () => {
    const run = await start();
    expect(run.status).toBe("planned");
    expect((await resumeRun(root, run.runId)).status).toBe("planned");
    expect(await readFile(join(root, ".avalon", ".gitignore"), "utf8")).toBe("*\n");
    const profile = await readFile(join(root, ".avalon", "project.json"), "utf8");
    expect((await withStateLock(root, () => initProjectUnlocked(root))).status).toBe("existing");
    expect(await readFile(join(root, ".avalon", "project.json"), "utf8")).toBe(profile);
    if (process.platform !== "win32") {
      expect((await stat(join(root, ".avalon", "project.json"))).mode & 0o777).toBe(0o600);
      expect((await stat(join(root, ".avalon"))).mode & 0o777).toBe(0o700);
    }
  });

  it("requires artifact evidence, validates it, and preserves terminal results", async () => {
    const run = await start();
    await expect(finishRun(root, { id: run.runId, status: "complete", summary: "Done." })).rejects.toThrow("artifact-backed evidence");
    await expect(recordRun(root, { id: run.runId, kind: "evidence", message: "Done.", acceptDrift: false })).rejects.toThrow("invalid format");
    await writeFile(join(root, "check.txt"), "The executed check exits with code 0.\n");
    await recordRun(root, { id: run.runId, kind: "evidence", message: "The actual check completes.", artifact: "check.txt", acceptDrift: false });
    const result = await finishRun(root, { id: run.runId, status: "complete", summary: "The execution completes. The research hypothesis is refuted." });
    expect(result.status).toBe("complete");
    expect((await resumeRun(root, run.runId)).result).toEqual(result);
    await expect(recordRun(root, { id: run.runId, kind: "observation", message: "Another claim.", acceptDrift: false })).rejects.toThrow("terminal");
    await expect(finishRun(root, { id: run.runId, status: "failed", summary: "Replace it." })).rejects.toThrow("terminal");
    await writeFile(join(root, "check.txt"), "Changed evidence.");
    await expect(resumeRun(root, run.runId)).rejects.toThrow("artifact changes");
  });

  it("rejects empty evidence and permits an inconclusive result", async () => {
    const run = await start();
    await writeFile(join(root, "empty.txt"), "");
    await expect(recordRun(root, { id: run.runId, kind: "evidence", message: "Claim.", artifact: "empty.txt", acceptDrift: false })).rejects.toThrow("invalid format");
    expect((await finishRun(root, { id: run.runId, status: "inconclusive", summary: "The trainer is unavailable." })).status).toBe("inconclusive");
  });

  it("rejects declared input drift and requires new evidence after an explicit change", async () => {
    await writeFile(join(root, "reward.py"), "reward = 1\n");
    await writeFile(join(root, "proof.txt"), "A prior check.\n");
    const run = await start(["reward.py"]);
    await recordRun(root, { id: run.runId, kind: "evidence", message: "The prior check.", artifact: "proof.txt", acceptDrift: false });
    await writeFile(join(root, "reward.py"), "reward = 2\n");
    await expect(resumeRun(root, run.runId)).rejects.toThrow("--accept-drift");
    await expect(recordRun(root, { id: run.runId, kind: "observation", message: "Accept it.", acceptDrift: true })).rejects.toThrow("only with a decision");
    await recordRun(root, { id: run.runId, kind: "decision", message: "The patch intentionally changes the reward.", acceptDrift: true });
    await expect(finishRun(root, { id: run.runId, status: "complete", summary: "Done." })).rejects.toThrow("fresh artifact-backed evidence");
    await writeFile(join(root, "new-proof.txt"), "The patched check exits with code 0.\n");
    await recordRun(root, { id: run.runId, kind: "evidence", message: "The patch passes the check.", artifact: "new-proof.txt", acceptDrift: false });
    expect((await finishRun(root, { id: run.runId, status: "complete", summary: "The patched workflow completes." })).status).toBe("complete");
  });

  it("detects metadata changes without scanning private research", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "run-tests" }, dependencies: { numpy: "x" } }));
    await mkdir(join(root, "research"));
    await symlink(join(root, "absent"), join(root, "research", "private.json"));
    const run = await start();
    expect((await discoverProject(root)).scripts).toEqual(["test"]);
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "new-test" } }));
    await expect(resumeRun(root, run.runId)).rejects.toThrow("bound project files change");
  });

  it("detects changed event history", async () => {
    const run = await start();
    await recordRun(root, { id: run.runId, kind: "observation", message: "First observation.", acceptDrift: false });
    await recordRun(root, { id: run.runId, kind: "hypothesis", message: "A possible cause.", acceptDrift: false });
    const path = join(root, run.directory, "events", "000001.json");
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof value !== "object" || value === null) throw new Error("Missing fixture.");
    await writeFile(path, JSON.stringify({ ...value, message: "A changed observation." }));
    await expect(resumeRun(root, run.runId)).rejects.toThrow("event chain changes");
  });

  it("rejects project escape, symlinks, invalid identifiers, and concurrent mutation", async () => {
    await writeFile(join(bundle, "outside.txt"), "Private outside file.");
    await symlink(join(bundle, "outside.txt"), join(root, "linked.txt"));
    await expect(start(["linked.txt"])).rejects.toThrow("symbolic links");
    await expect(start([join(bundle, "outside.txt")])).rejects.toThrow("inside the selected project");
    await expect(resumeRun(root, "../../outside")).rejects.toThrow("run identifier");
    await withStateLock(root, async () => {
      await expect(withStateLock(root, async () => "second operation")).rejects.toThrow("state lock");
    });
    expect((await readdir(join(root, ".avalon"))).includes(".lock")).toBe(false);
    await rm(join(root, ".avalon"), { recursive: true });
    await symlink(bundle, join(root, ".avalon"));
    await expect(start()).rejects.toThrow("real directory");
  });

  it("bounds reads and refuses special files", async () => {
    await writeFile(join(root, "large.txt"), Buffer.alloc(MAX_JSON_BYTES + 1));
    await expect(readBytes(root, "large.txt")).rejects.toThrow("byte limit");
    await mkdir(join(root, "directory"));
    await expect(fingerprint(root, "directory")).rejects.toThrow("regular artifact");
  });
});

describe("project skill installation", () => {
  it.each(["cursor", "claude", "codex"] as const)("installs all workflows and shared files for %s", async host => {
    const preview = await installSkills({ root, host, dryRun: true, sourceRoot: bundle });
    expect(preview.status).toBe("planned");
    expect(await readdir(root)).toEqual([]);
    const result = await installSkills({ root, host, dryRun: false, sourceRoot: bundle });
    expect(result.commands).toBe(COMMAND_NAMES.length);
    expect(result.newFiles).toBe(COMMAND_NAMES.length + 1);
    for (const name of COMMAND_NAMES) expect(await readFile(join(root, result.directory, name, "SKILL.md"), "utf8")).toContain(`name: ${name}`);
    expect(await readFile(join(root, result.directory, "_shared", "workflow.md"), "utf8")).toContain("Execute");
    expect((await installSkills({ root, host, dryRun: false, sourceRoot: bundle })).status).toBe("unchanged");
  });

  it("preflights every collision before writing the first file", async () => {
    await mkdir(join(root, ".cursor", "skills", "rl-train"), { recursive: true });
    await writeFile(join(root, ".cursor", "skills", "rl-train", "SKILL.md"), "Keep this user skill.\n");
    await expect(installSkills({ root, host: "cursor", dryRun: false, sourceRoot: bundle })).rejects.toThrow("installed skill differs");
    expect(await readdir(join(root, ".cursor", "skills"))).toEqual(["rl-train"]);
    expect(await readFile(join(root, ".cursor", "skills", "rl-train", "SKILL.md"), "utf8")).toBe("Keep this user skill.\n");
  });

  it("rejects a symlinked destination and a missing registered skill", async () => {
    await symlink(bundle, join(root, ".cursor"));
    await expect(installSkills({ root, host: "cursor", dryRun: false, sourceRoot: bundle })).rejects.toThrow("symbolic links");
    await rm(join(root, ".cursor"));
    await rm(join(bundle, "skills", "rl-data", "SKILL.md"));
    await expect(installSkills({ root, host: "cursor", dryRun: false, sourceRoot: bundle })).rejects.toThrow("missing its SKILL.md");
    expect(await readdir(root)).toEqual([]);
  });
});
