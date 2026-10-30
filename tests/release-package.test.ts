import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

const packs = z.array(z.object({ files: z.array(z.object({ path: z.string() })) }));

describe("release package", () => {
  it("ships the executable examples and excludes private research", () => {
    const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--cache", join(tmpdir(), "avalon-npm-cache")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const files = packs.parse(JSON.parse(result.stdout) as unknown)[0]?.files.map(file => file.path) ?? [];
    expect(files).toContain("examples/world/claim-plan.json");
    expect(files).toContain("dist/cli.js");
    expect(files.some(path => path.startsWith("research/"))).toBe(false);
  });

  it("binds both artifacts and rejects a substituted file link", () => {
    const directory = mkdtempSync(join(tmpdir(), "avalon-manifest-"));
    const nodeVersion = z.object({ version: z.string() }).parse(JSON.parse(readFileSync("package.json", "utf8")) as unknown).version;
    const pythonVersion = readFileSync("python/pyproject.toml", "utf8").match(/^version = "([0-9.]+)"$/m)?.[1];
    const nodeName = `avalon-rl-${nodeVersion}.tgz`;
    const pythonName = `avalon_rl_lab-${pythonVersion}-py3-none-any.whl`;
    const args = ["scripts/release-manifest.mjs", "--directory", directory, "--commit", "a".repeat(40)];
    try {
      writeFileSync(join(directory, nodeName), "node archive");
      symlinkSync(join(directory, nodeName), join(directory, pythonName));
      expect(spawnSync(process.execPath, args, { encoding: "utf8" }).status).toBe(1);
      rmSync(join(directory, pythonName));
      writeFileSync(join(directory, pythonName), "python wheel");
      const result = spawnSync(process.execPath, args, { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const sums = readFileSync(join(directory, "SHA256SUMS"), "utf8");
      expect(sums).toContain(`${createHash("sha256").update("node archive").digest("hex")}  ${nodeName}`);
      expect(sums).toContain(`${createHash("sha256").update("python wheel").digest("hex")}  ${pythonName}`);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
