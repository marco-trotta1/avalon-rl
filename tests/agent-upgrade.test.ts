import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pendingBundle, writeBundle } from "../src/agent/bundle.js";
import { COMMAND_NAMES } from "../src/agent/catalog.js";
import { installSkills } from "../src/agent/install.js";
import { digest, withStateLock } from "../src/agent/io.js";

let root: string;
const target = ".agents/skills/_shared/workflow.md";
const stock = "The reviewed stock protocol.\n";
const next = "The new stock protocol.\n";
const custom = "The user's new customization.\n";
const originalRename = fs.promises.rename;
const originalLink = fs.promises.link;
const originalOpen = fs.promises.open;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "avalon-agent-upgrade-"));
  await mkdir(join(root, ".agents/skills/_shared"), { recursive: true });
  await writeFile(join(root, target), stock);
});
afterEach(async () => {
  fs.promises.rename = originalRename;
  fs.promises.link = originalLink;
  fs.promises.open = originalOpen;
  syncBuiltinESMExports();
  await rm(root, { recursive: true, force: true });
});

async function pending() {
  return pendingBundle({
    root, files: [{ source: "skills/_shared/workflow.md", target, bytes: Buffer.from(next) }],
    replace: new Map([[target, digest(stock)]]),
  });
}

async function contents(directory: string): Promise<string[]> {
  const values: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await contents(path));
    else if (entry.isFile()) values.push(await readFile(path, "utf8"));
  }
  return values;
}

async function backups(): Promise<string[]> {
  const directory = join(root, ".avalon/install-backups");
  return (await readdir(directory)).map(name => join(directory, name, "displaced"));
}

describe("stock protocol upgrades", () => {
  it.each(["cursor", "claude", "codex"] as const)("upgrades the stock 0.6 protocol for %s and preserves the previous runtime", async host => {
    const source = join(import.meta.dirname, "../skills");
    const directory = join(root, host === "codex" ? ".agents/skills" : `.${host}/skills`);
    await mkdir(join(directory, "_shared"), { recursive: true });
    const added = new Set(["rl-swarm", "rl-sweep", "rl-status"]);
    for (const name of COMMAND_NAMES.filter(name => !added.has(name))) {
      await cp(join(source, name), join(directory, name), { recursive: true });
    }
    await cp(join(source, "_shared/artifacts.md"), join(directory, "_shared/artifacts.md"));
    const protocol = join(directory, "_shared/workflow.md");
    await cp(join(import.meta.dirname, "fixtures/agent-workflow-v0.6.0.md"), protocol);
    const preserved = await readFile(protocol, "utf8");
    const previous = join(root, ".avalon/runtime/0.6.0/dist/cli.js");
    await mkdir(dirname(previous), { recursive: true });
    await writeFile(previous, "The previous runtime remains available.\n");
    const installed = await installSkills({ root, host, dryRun: false });
    expect(installed.runtime.version).toBe("0.8.0");
    expect(installed.updatedFiles).toBe(1);
    expect(installed.backups).toHaveLength(1);
    expect(await readFile(join(root, installed.backups[0] ?? "missing"), "utf8")).toBe(preserved);
    expect(await readFile(protocol, "utf8")).toBe(await readFile(join(source, "_shared/workflow.md"), "utf8"));
    expect(await readFile(protocol, "utf8")).toContain("runtime/0.8.0/dist/cli.js");
    expect(await readFile(previous, "utf8")).toBe("The previous runtime remains available.\n");
    for (const name of added) {
      expect(await readFile(join(directory, name, "SKILL.md"), "utf8")).toContain(`name: ${name}`);
    }
    const entrypoint = join(root, installed.runtime.entrypoint);
    const catalog = spawnSync(process.execPath, [entrypoint, "agent", "commands", "--json"], { encoding: "utf8" });
    expect(catalog.status, catalog.stderr).toBe(0);
    for (const name of added) expect(catalog.stdout).toContain(`"invocation": "/${name}"`);
    const selector = spawnSync(process.execPath, [entrypoint, "select", "--help"], { encoding: "utf8" });
    expect(selector.status, selector.stderr).toBe(0);
    expect(selector.stdout).toContain("--plan");
  });

  it.each(["cursor", "claude", "codex"] as const)("upgrades stock 0.7 files for %s", async host => {
    const source = join(import.meta.dirname, "../skills");
    const directory = join(root, host === "codex" ? ".agents/skills" : `.${host}/skills`);
    await cp(source, directory, { recursive: true });
    for (const [name, location] of [["workflow", "_shared/workflow.md"], ["selection", "_shared/selection.md"], ["avalon", "avalon/SKILL.md"]]) {
      await cp(join(import.meta.dirname, `fixtures/agent-${name}-v0.7.0.md`), join(directory, location!));
    }
    const installed = await installSkills({ root, host, dryRun: false });
    expect(installed.runtime.version).toBe("0.8.0");
    expect(installed.updatedFiles).toBe(3);
    expect(installed.backups).toHaveLength(3);
    expect(await readFile(join(directory, "_shared/workflow.md"), "utf8")).toContain(installed.runtime.entrypoint);
  });

  it.each(["0.5.0", "0.6.0", "0.7.0"])("preserves a customized %s protocol before installing any other files", async version => {
    const previous = await readFile(join(import.meta.dirname, `fixtures/agent-workflow-v${version}.md`), "utf8");
    await writeFile(join(root, target), previous + custom);
    await expect(installSkills({ root, host: "codex", dryRun: false })).rejects.toThrow("installed skill differs");
    expect(await readFile(join(root, target), "utf8")).toBe(previous + custom);
    expect(await readdir(root)).toEqual([".agents"]);
    expect(await readdir(join(root, ".agents/skills"))).toEqual(["_shared"]);
  });

  it("preserves an editor change between validation and replacement", async () => {
    const files = await pending();
    const live = join(root, target);
    fs.promises.rename = async (source, destination) => {
      if (String(source) === live || String(destination) === live) await writeFile(live, custom);
      return originalRename(source, destination);
    };
    syncBuiltinESMExports();
    let failure: unknown;
    try { await withStateLock(root, () => writeBundle({ root, files })); }
    catch (cause) { failure = cause; }
    expect(await contents(root)).toContain(custom);
    expect(await readFile(live, "utf8")).toBe(custom);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(".avalon/install-backups/");
    expect(await readFile((await backups())[0] ?? "missing", "utf8")).toBe(custom);
  });

  it("preserves a recreated target and the displaced stock when publication loses a race", async () => {
    const files = await pending();
    const live = join(root, target);
    fs.promises.link = async (source, destination) => {
      if (String(source).endsWith(".tmp") && String(destination) === live) await writeFile(live, custom);
      return originalLink(source, destination);
    };
    syncBuiltinESMExports();
    await expect(withStateLock(root, () => writeBundle({ root, files }))).rejects.toThrow(".avalon/install-backups/");
    expect(await readFile(live, "utf8")).toBe(custom);
    expect(await readFile((await backups())[0] ?? "missing", "utf8")).toBe(stock);
    expect((await readdir(dirname(live))).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  it("returns an owner-protected retained backup after a successful stock upgrade", async () => {
    const files = await pending();
    const saved = await withStateLock(root, () => writeBundle({ root, files }));
    expect(saved).toHaveLength(1);
    const backup = saved[0];
    if (backup === undefined) throw new Error("Missing backup reference.");
    expect(backup).toMatch(/^\.avalon\/install-backups\/[^/]+\/displaced$/);
    expect(await readFile(join(root, backup), "utf8")).toBe(stock);
    expect(await readFile(join(root, target), "utf8")).toBe(next);
    expect(await readFile(join(root, ".avalon/.gitignore"), "utf8")).toBe("*\n");
    expect((await stat(dirname(join(root, backup)))).mode & 0o777).toBe(0o700);
    expect((await readdir(join(root, ".agents/skills/_shared"))).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  it("restores displaced regular content when its post-move read fails", async () => {
    const files = await pending();
    fs.promises.open = async (path, flags, mode) => {
      if (String(path).includes("/install-backups/") && String(path).endsWith("/displaced")) {
        throw Object.assign(new Error("The backup read fails."), { code: "EACCES" });
      }
      return originalOpen(path, flags, mode);
    };
    syncBuiltinESMExports();
    await expect(withStateLock(root, () => writeBundle({ root, files }))).rejects.toThrow(".avalon/install-backups/");
    expect(await readFile(join(root, target), "utf8")).toBe(stock);
    expect(await readFile((await backups())[0] ?? "missing", "utf8")).toBe(stock);
  });

  it.each([false, true])("preserves the installed file when a move reports failure afterMove=%s", async afterMove => {
    const files = await pending();
    const live = join(root, target);
    fs.promises.rename = async (source, destination) => {
      if (String(source) !== live) return originalRename(source, destination);
      if (afterMove) await originalRename(source, destination);
      throw Object.assign(new Error("The move reports failure."), { code: "EACCES" });
    };
    syncBuiltinESMExports();
    await expect(withStateLock(root, () => writeBundle({ root, files }))).rejects.toThrow(".avalon/install-backups/");
    expect(await readFile(live, "utf8")).toBe(stock);
    if (afterMove) expect(await readFile((await backups())[0] ?? "missing", "utf8")).toBe(stock);
    expect((await readdir(dirname(live))).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
});
