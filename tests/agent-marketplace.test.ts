import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { COMMAND_NAMES } from "../src/agent/catalog.js";

const catalog = z.object({
  name: z.string().min(1),
  plugins: z.array(z.object({ name: z.string().min(1), source: z.string().min(1) })),
});
const manifest = z.object({ name: z.string().min(1), skills: z.string().min(1) });
const packs = z.array(z.object({ files: z.array(z.object({ path: z.string() })) }));

describe("native agent marketplaces", () => {
  it("ships catalogs that resolve to the complete root plugin", () => {
    const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--cache", join(tmpdir(), "avalon-marketplace-npm-cache")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const packed = packs.parse(JSON.parse(result.stdout) as unknown)[0];
    expect(packed).toBeDefined();
    const files = new Set(packed?.files.map(file => file.path));

    for (const host of ["claude", "cursor"]) {
      const directory = `.${host}-plugin`;
      const catalogPath = `${directory}/marketplace.json`;
      expect(files.has(catalogPath)).toBe(true);
      const marketplace = catalog.parse(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
      expect(marketplace.plugins).toHaveLength(1);
      const entry = marketplace.plugins[0];
      expect(entry).toBeDefined();
      if (entry === undefined) throw new Error("The marketplace has no root plugin.");
      expect(resolve(entry.source)).toBe(process.cwd());

      const pluginPath = `${directory}/plugin.json`;
      expect(files.has(pluginPath)).toBe(true);
      const plugin = manifest.parse(JSON.parse(readFileSync(pluginPath, "utf8")) as unknown);
      expect(entry.name).toBe(plugin.name);
      const skillRoot = plugin.skills.replace(/^\.\//, "").replace(/\/$/, "");
      for (const name of COMMAND_NAMES) expect(files.has(`${skillRoot}/${name}/SKILL.md`)).toBe(true);
      expect(files.has(`${skillRoot}/_shared/workflow.md`)).toBe(true);
      expect(files.has(`${skillRoot}/_shared/artifacts.md`)).toBe(true);
    }
  });
});
