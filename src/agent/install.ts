import { fileURLToPath } from "node:url";
import { COMMAND_NAMES } from "./catalog.js";
import { collectBundle, pendingBundle, writeBundle, type BundleFile } from "./bundle.js";
import { digest, inspectPath, readBytes } from "./io.js";
import { prepareRuntime } from "./runtime.js";

export type AgentHost = "cursor" | "claude" | "codex";
const hostDirectories: Record<AgentHost, string> = { cursor: ".cursor/skills", claude: ".claude/skills", codex: ".agents/skills" };
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const stock050Protocol = "20dd82a534c7fcfea8c9a6e0a87b69c4d8129f6ee488e449fdf13d58a435359b";
const stock060Protocol = "8d971c5d16683dd1fedd9641c81ad254be0eeef4b23b6aa6fbceadb5e4301b9a";

export async function installSkills(input: { root: string; host: AgentHost; dryRun: boolean; sourceRoot?: string }) {
  const sourceRoot = input.sourceRoot ?? packageRoot;
  const files: BundleFile[] = [];
  for (const name of [...COMMAND_NAMES, "_shared"]) {
    files.push(...await collectBundle({ root: sourceRoot, source: `skills/${name}`, target: `${hostDirectories[input.host]}/${name}`, accept: () => true }));
  }
  for (const name of COMMAND_NAMES) {
    if (!files.some(file => file.source === `skills/${name}/SKILL.md`)) throw new Error("A registered workflow is missing its SKILL.md file.");
  }
  files.sort((left, right) => left.target.localeCompare(right.target));
  const runtime = await prepareRuntime();
  const protocol = `${hostDirectories[input.host]}/_shared/workflow.md`;
  const replace = new Map<string, string>();
  if ((await inspectPath(input.root, protocol)).exists) {
    const previousSha256 = digest(await readBytes(input.root, protocol));
    if (previousSha256 === stock050Protocol || previousSha256 === stock060Protocol) replace.set(protocol, previousSha256);
  }
  const stock070 = [
    ["_shared/workflow.md", "054db586725541e1d8469b39165dfe25f0c031d750e5ab8aa35c772556341ec2"],
    ["_shared/selection.md", "757cc8ee6ff5c2399a5e0b1d25498d45cec378bd4c43978f91592ec9841ebc80"],
    ["avalon/SKILL.md", "96bcda7e2870f4b6418ddd9df2233a069dfeb8bb7af350735196ab9208a0f86e"],
  ] as const;
  for (const [relativePath, reviewedHash] of stock070) {
    const target = `${hostDirectories[input.host]}/${relativePath}`;
    if ((await inspectPath(input.root, target)).exists && digest(await readBytes(input.root, target)) === reviewedHash) {
      replace.set(target, reviewedHash);
    }
  }
  const pending = await pendingBundle({ root: input.root, files: [...files, ...runtime.files], replace });
  const backups = input.dryRun ? [] : await writeBundle({ root: input.root, files: pending });
  const skillTargets = new Set(files.map(file => file.target));
  const newSkills = pending.filter(file => skillTargets.has(file.target) && file.kind === "create").length;
  const updatedSkills = pending.filter(file => skillTargets.has(file.target) && file.kind === "replace").length;
  return {
    format: "avalon-agent-install-v1", host: input.host, dryRun: input.dryRun,
    status: input.dryRun ? "planned" : pending.length ? "installed" : "unchanged",
    commands: COMMAND_NAMES.length, files: files.length, newFiles: newSkills, updatedFiles: updatedSkills, backups,
    directory: hostDirectories[input.host], bundleFingerprint: digest(Buffer.concat(files.map(file => Buffer.from(`${file.source}\0${digest(file.bytes)}\n`)))),
    runtime: { ...runtime.reference, files: runtime.files.length, newFiles: pending.length - newSkills - updatedSkills },
    invocation: input.host === "codex" ? "$avalon or select the skill in the host's skill menu" : "/avalon",
    next: "Refresh the agent's skill discovery. The project runtime works without a global install or the original npm cache.",
  };
}
