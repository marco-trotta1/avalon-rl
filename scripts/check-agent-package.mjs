import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = resolve(root, "skills");
const expected = new Set([
  "avalon", "rl-research", "rl-spec", "rl-env", "rl-scenarios", "rl-reward", "rl-break", "rl-harden",
  "rl-data", "rl-probs", "rl-credit", "rl-train", "rl-diagnose", "rl-ablate", "rl-curriculum", "rl-eval",
  "rl-transfer", "rl-optimize", "rl-reproduce", "rl-release",
]);
const failures = [];

async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Use a regular package file.");
  return readFile(path, "utf8");
}

async function inspectMarkdown(path) {
  const text = await regular(path);
  if (text.includes("\u2014")) failures.push(`${relative(root, path)} contains an em dash.`);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolved = resolve(dirname(path), target);
    const within = relative(skillRoot, resolved);
    if (isAbsolute(target) || within.startsWith("..") || isAbsolute(within)) {
      failures.push(`${relative(root, path)} has a link outside the installed skills.`);
      continue;
    }
    try { await regular(resolved); }
    catch { failures.push(`${relative(root, path)} has a missing local reference.`); }
  }
  return text;
}

const entries = await readdir(skillRoot, { withFileTypes: true });
const found = new Set();
for (const entry of entries) {
  if (entry.name === "_shared") continue;
  if (!entry.isDirectory() || !expected.has(entry.name)) {
    failures.push(`Unexpected skill entry: ${entry.name}`);
    continue;
  }
  const text = await inspectMarkdown(resolve(skillRoot, entry.name, "SKILL.md"));
  const metadata = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const name = metadata?.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
  if (name !== entry.name || !/^description:\s*\S.+$/m.test(metadata ?? "")) {
    failures.push(`Invalid name or description: ${entry.name}`);
  }
  if (text.length < 1000) failures.push(`The skill lacks a substantive workflow: ${entry.name}`);
  found.add(entry.name);
}
for (const name of expected) if (!found.has(name)) failures.push(`Missing skill: ${name}`);
for (const entry of await readdir(resolve(skillRoot, "_shared"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md")) await inspectMarkdown(resolve(skillRoot, "_shared", entry.name));
}

const pkg = JSON.parse(await regular(resolve(root, "package.json")));
for (const name of ["plugin.json", ".cursor-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
  const manifest = JSON.parse(await regular(resolve(root, name)));
  if (manifest.name !== "avalon" || manifest.version !== pkg.version || !manifest.description?.trim()) {
    failures.push(`The plugin manifest does not match the package: ${name}`);
  }
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Agent package check passes: 20 workflows, local references, and matching manifests.\n");
}
