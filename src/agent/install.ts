import { readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_NAMES } from "./catalog.js";
import { digest, ensureDirectory, inspectPath, readBytes, writeNew } from "./io.js";

export type AgentHost = "cursor" | "claude" | "codex";
const hostDirectories: Record<AgentHost, string> = { cursor: ".cursor/skills", claude: ".claude/skills", codex: ".agents/skills" };
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function installSkills(input: { root: string; host: AgentHost; dryRun: boolean; sourceRoot?: string }) {
  const sourceRoot = input.sourceRoot ?? packageRoot;
  const files: { source: string; target: string; bytes: Buffer }[] = [];
  let totalBytes = 0;
  async function collect(directory: string): Promise<void> {
    const info = await inspectPath(sourceRoot, directory);
    if (!info.exists) throw new Error("The packaged skill bundle is missing. Install the complete Avalon package.");
    for (const entry of await readdir(info.absolute, { withFileTypes: true })) {
      const source = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("The skill bundle contains a symbolic link.");
      if (entry.isDirectory()) await collect(source);
      else {
        if (!entry.isFile()) throw new Error("The skill bundle contains a special file.");
        if (files.length >= 512) throw new Error("The skill bundle exceeds the file limit.");
        const bytes = await readBytes(sourceRoot, source);
        totalBytes += bytes.length;
        if (totalBytes > 16 * 1024 * 1024) throw new Error("The skill bundle exceeds the byte limit.");
        files.push({ source, target: `${hostDirectories[input.host]}/${source.slice("skills/".length)}`, bytes });
      }
    }
  }
  for (const name of [...COMMAND_NAMES, "_shared"]) await collect(`skills/${name}`);
  for (const name of COMMAND_NAMES) {
    if (!files.some(file => file.source === `skills/${name}/SKILL.md`)) throw new Error("A registered workflow is missing its SKILL.md file.");
  }
  files.sort((left, right) => left.target.localeCompare(right.target));
  const pending: typeof files = [];
  for (const file of files) {
    const path = await inspectPath(input.root, file.target);
    if (!path.exists) pending.push(file);
    else if (!(await readBytes(input.root, file.target)).equals(file.bytes)) throw new Error("An installed skill differs. Preserve it and choose a clean project or remove it explicitly.");
  }
  if (!input.dryRun) {
    for (const file of pending) {
      const parent = relative(input.root, dirname(resolve(input.root, file.target)));
      await ensureDirectory(input.root, parent);
      await writeNew(input.root, file.target, file.bytes);
    }
  }
  return {
    format: "avalon-agent-install-v1", host: input.host, dryRun: input.dryRun,
    status: input.dryRun ? "planned" : pending.length ? "installed" : "unchanged",
    commands: COMMAND_NAMES.length, files: files.length, newFiles: pending.length,
    directory: hostDirectories[input.host], bundleFingerprint: digest(Buffer.concat(files.map(file => Buffer.from(`${file.source}\0${digest(file.bytes)}\n`)))),
    invocation: input.host === "codex" ? "$avalon or select the skill in the host's skill menu" : "/avalon",
    next: "Restart or refresh the agent's skill discovery. The installation does not invoke a model or execute an RL job.",
  };
}
