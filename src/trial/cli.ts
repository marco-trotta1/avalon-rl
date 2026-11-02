import { parseArgs } from "node:util";
import { readLocalText, writeLocalText } from "../lab/io.js";
import { parseTrial, runTrial } from "./run.js";
import { initTrial } from "./init.js";
import { runSession, replaySession, exportTrialTask } from "./session.js";

export async function runTrialCli(args: string[]): Promise<number> {
  try {
    const parsed = parseArgs({ args, strict: true, allowPositionals: true, tokens: true, options: {
      data: { type: "string" }, out: { type: "string" }, bundle: { type: "string" }, case: { type: "string" }, help: { type: "boolean" },
    } });
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw new Error("Use each trial option once.");
      seen.add(token.name);
    }
    if (parsed.values.help) {
      process.stdout.write(`avalon trial init --out NEW_DIRECTORY
avalon trial run --data session.json --out NEW_DIRECTORY
avalon trial replay --bundle RUN_DIRECTORY --out NEW_DIRECTORY
avalon trial export --bundle RUN_DIRECTORY --case CASE_ID --out NEW_DIRECTORY
avalon trial --data trial.json --out private-report.json
Read docs/team-trial.md before using team data.
Run and replay execute trusted local adapter code with your user permissions.
`);
      return 0;
    }
    if (parsed.positionals.length > 1) throw new Error("Supply one trial command.");
    const command = parsed.positionals[0] ?? "audit";
    const allowed = command === "init" ? ["out"] : command === "export" ? ["bundle", "case", "out"]
      : command === "replay" ? ["bundle", "out"] : ["data", "out"];
    if ([...seen].some(name => !allowed.includes(name))) throw new Error("The trial command does not support this option.");
    if (!parsed.values.out?.trim()) throw new Error("Supply a nonempty --out path.");
    if (command === "init") { await initTrial(parsed.values.out); return 0; }
    if (command === "export") {
      if (!parsed.values.bundle?.trim() || !parsed.values.case?.trim()) throw new Error("Supply --bundle and --case.");
      await exportTrialTask({ bundle: parsed.values.bundle, caseId: parsed.values.case, out: parsed.values.out });
      return 0;
    }
    if (command === "replay") {
      if (!parsed.values.bundle?.trim()) throw new Error("Supply --bundle RUN_DIRECTORY.");
      return await replaySession({ bundle: parsed.values.bundle, out: parsed.values.out });
    }
    if (command === "run") {
      if (!parsed.values.data?.trim()) throw new Error("Supply --data session.json.");
      return await runSession({ data: parsed.values.data, out: parsed.values.out });
    }
    if (command !== "audit") throw new Error("Select trial init, run, replay, export, or audit.");
    if (!parsed.values.data || !parsed.values.out) throw new Error("Supply --data and --out. The report contains private evidence.");
    const trial = parseTrial(JSON.parse(await readLocalText(parsed.values.data)) as unknown);
    const report = runTrial(trial);
    await writeLocalText({ output: { type: "file", path: parsed.values.out }, text: JSON.stringify(report, null, 2) + "\n" });
    if (report.cases.some(item => item.avalon.status !== item.expected)) return 4;
    if (report.cases.some(item => item.avalon.status === "unknown")) return 5;
    return 0;
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : "The trial cannot complete.") + "\n");
    return 1;
  }
}
