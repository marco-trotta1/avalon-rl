import { fileURLToPath } from "node:url";
import { COMMAND_NAMES } from "./catalog.js";
import { collectBundle, pendingBundle, writeBundle, type BundleFile } from "./bundle.js";
import { digest } from "./io.js";
import { prepareRuntime } from "./runtime.js";

export type AgentHost = "cursor" | "claude" | "codex";
const hostDirectories: Record<AgentHost, string> = { cursor: ".cursor/skills", claude: ".claude/skills", codex: ".agents/skills" };
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const stock050Protocol = "20dd82a534c7fcfea8c9a6e0a87b69c4d8129f6ee488e449fdf13d58a435359b";

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
  const replace = new Map([[`${hostDirectories[input.host]}/_shared/workflow.md`, stock050Protocol]]);
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
