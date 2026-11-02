import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const TRIAL_TEMPLATE_FILES = ["session.json", "adapter.py", "agent.py", "ollama-agent.py", "START.md"] as const;

export async function initTrial(out: string): Promise<void> {
  const directory = resolve(out);
  const names = TRIAL_TEMPLATE_FILES;
  const templates = await Promise.all(names.map(name => readFile(new URL(`../../examples/team-trial/${name}`, import.meta.url))));
  await mkdir(directory, { mode: 0o700 });
  for (const [index, name] of names.entries()) {
    await writeFile(join(directory, name), templates[index]!, { flag: "wx", mode: 0o600 });
  }
  process.stdout.write(`The private trial workspace is ready: ${directory}\nRead START.md before running the session.\n`);
}
