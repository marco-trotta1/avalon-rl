import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { directory: { type: "string" }, commit: { type: "string" } } });
if (!values.directory || !/^[a-f0-9]{40}$/.test(values.commit ?? "")) {
  throw new Error("Supply an artifact directory and the complete source commit.");
}
const directory = values.directory;
if (!(await lstat(directory)).isDirectory()) throw new Error("Use a regular artifact directory.");
const nodePackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pythonProject = await readFile(new URL("../python/pyproject.toml", import.meta.url), "utf8");
const pythonVersion = pythonProject.match(/^version = "([0-9]+\.[0-9]+\.[0-9]+)"$/m)?.[1];
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(nodePackage.version) || !pythonVersion) {
  throw new Error("Use explicit package versions before building the release.");
}
const names = [`avalon-rl-${nodePackage.version}.tgz`, `avalon_rl_lab-${pythonVersion}-py3-none-any.whl`].sort();
const existing = await readdir(directory);
if (existing.some(name => !names.includes(name))) throw new Error("Use a new directory with only the two package artifacts.");
const artifacts = [];
for (const name of names) {
  const path = join(directory, name);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Use regular package files.");
  const content = await readFile(path);
  artifacts.push({ name, bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") });
}
const manifest = {
  format: "avalon.release/v1", commit: values.commit,
  packages: { node: nodePackage.version, python: pythonVersion }, runtime: { node: process.versions.node }, artifacts,
  limits: ["Hashes bind these package bytes to this declared source commit.", "The manifest does not prove build reproducibility or package safety.", "Use the accompanying validation run and installation checks."],
};
await writeFile(join(directory, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
await writeFile(join(directory, "SHA256SUMS"), artifacts.map(file => `${file.sha256}  ${file.name}\n`).join(""), { flag: "wx" });
