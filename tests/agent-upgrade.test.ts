import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pendingBundle, writeBundle } from "../src/agent/bundle.js";
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
