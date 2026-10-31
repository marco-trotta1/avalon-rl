import { parseArgs } from "node:util";
import { AGENT_COMMANDS, parseCommandName } from "./catalog.js";
import { installSkills, type AgentHost } from "./install.js";
import { inspectPath, projectRoot, withStateLock } from "./io.js";
import { discoverProject, initProjectUnlocked } from "./project.js";
import { finishRun, recordRun, resumeRun, startRun, type FinishStatus, type RecordKind } from "./runs.js";
import { assertNever } from "../lib/schema.js";
import { installRuntime } from "./runtime.js";

const OPERATIONS = ["commands", "doctor", "init", "install", "start", "record", "finish", "resume"] as const;
type Operation = typeof OPERATIONS[number];

const help = `Avalon agent workflows

Usage:
  avalon agent commands [--json]
  avalon agent doctor [--project PATH]
  avalon agent init [--project PATH]
  avalon install cursor|claude|codex [--project PATH] [--dry-run]
  avalon agent install --host cursor|claude|codex [--project PATH] [--dry-run]
  avalon install --runtime-only [--project PATH] [--dry-run]
  avalon agent start COMMAND --goal TEXT [--project PATH] [--input FILE ...]
  avalon agent record RUN_ID --kind observation|hypothesis|evidence|decision --message TEXT [--artifact FILE] [--accept-drift] [--project PATH]
  avalon agent finish RUN_ID --status complete|inconclusive|blocked|failed --summary TEXT [--project PATH]
  avalon agent resume RUN_ID [--project PATH]

The host executes the skill. This runtime does not invoke a model or run training.
Private records use .avalon. Evidence records require an artifact within the project.
Completion records describe host-reported execution, not verified scientific success.
Declared input and artifact files must not exceed 256 MiB. Records must not exceed 1 MiB.
Use --accept-drift only for an intentional decision. Fresh evidence is required after that decision.
Existing skills, profiles, events, and terminal results are preserved.
Installation defaults to the current directory and includes a private project runtime.
`;

class UsageError extends Error {}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new UsageError(`Supply ${label}.`);
  return value;
}

export async function runAgent(args: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, tokens: true, options: {
        help: { type: "boolean", short: "h" }, json: { type: "boolean" }, project: { type: "string" },
        host: { type: "string" }, "dry-run": { type: "boolean" }, "runtime-only": { type: "boolean" }, goal: { type: "string" }, input: { type: "string", multiple: true },
        kind: { type: "string" }, message: { type: "string" }, artifact: { type: "string" },
        "accept-drift": { type: "boolean" }, status: { type: "string" }, summary: { type: "string" },
      } });
    } catch { throw new UsageError("Check the agent option names and values."); }
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name) && token.name !== "input") throw new UsageError("Use each option only once, except --input.");
      seen.add(token.name);
    }
    const [requested, id, ...extra] = parsed.positionals;
    if (parsed.values.help || requested === undefined) { process.stdout.write(help); return 0; }
    const command = OPERATIONS.find(value => value === requested);
    if (command === undefined) throw new UsageError("Select a documented agent command.");
    const allowed: Record<Operation, readonly string[]> = {
      commands: ["json"], doctor: ["project"], init: ["project"], install: ["host", "project", "dry-run", "runtime-only"],
      start: ["project", "goal", "input"], record: ["project", "kind", "message", "artifact", "accept-drift"],
      finish: ["project", "status", "summary"], resume: ["project"],
    };
    const options = allowed[command];
    if ([...seen].some(name => !options.includes(name))) throw new UsageError("The agent command does not support this option.");
    const needsId = ["start", "record", "finish", "resume"].includes(command);
    if (extra.length || (command !== "install" && needsId !== (id !== undefined))) throw new UsageError("Check the number of agent command arguments.");
    if (command === "commands") {
      if (parsed.values.json) process.stdout.write(JSON.stringify({ format: "avalon-agent-commands-v1", commands: AGENT_COMMANDS }, null, 2) + "\n");
      else process.stdout.write(AGENT_COMMANDS.map(value => `${value.invocation}  ${value.description}`).join("\n") + "\n");
      return 0;
    }
    if (parsed.values.project !== undefined && !parsed.values.project.trim()) throw new UsageError("Supply a nonempty --project path.");
    const root = await projectRoot(parsed.values.project ?? process.cwd());
    let result: object;
    switch (command) {
      case "doctor": result = await discoverProject(root); break;
      case "init": result = await withStateLock(root, () => initProjectUnlocked(root)); break;
      case "install": {
        if (id !== undefined && parsed.values.host !== undefined) throw new UsageError("Select the host once.");
        const host = parsed.values.host ?? id;
        const dryRun = parsed.values["dry-run"] ?? false;
        if (parsed.values["runtime-only"]) {
          if (host !== undefined) throw new UsageError("Select a host or --runtime-only.");
          const install = () => installRuntime({ root, dryRun });
          result = dryRun ? await install() : await withStateLock(root, install);
          break;
        }
        if (host !== "cursor" && host !== "claude" && host !== "codex") throw new UsageError("Select --host cursor, claude, or codex.");
        const install = () => installSkills({ root, host: host satisfies AgentHost, dryRun });
        result = dryRun ? await install() : await withStateLock(root, install);
        break;
      }
      case "start": {
        const selected = parseCommandName(required(id, "a command name"));
        const goal = required(parsed.values.goal, "--goal TEXT");
        result = await withStateLock(root, () => startRun(root, { command: selected, goal, inputs: parsed.values.input ?? [] }));
        break;
      }
      case "record": {
        const kind = parsed.values.kind;
        if (kind !== "observation" && kind !== "hypothesis" && kind !== "evidence" && kind !== "decision") throw new UsageError("Select a supported --kind.");
        const message = required(parsed.values.message, "--message TEXT");
        const runId = required(id, "a run identifier");
        if (!(await inspectPath(root, `.avalon/project.json`)).exists) throw new Error("Initialize this project before recording a run.");
        result = await withStateLock(root, () => recordRun(root, {
          id: runId, kind: kind satisfies RecordKind, message, artifact: parsed.values.artifact,
          acceptDrift: parsed.values["accept-drift"] ?? false,
        }));
        break;
      }
      case "finish": {
        const status = parsed.values.status;
        if (status !== "complete" && status !== "inconclusive" && status !== "blocked" && status !== "failed") throw new UsageError("Select a supported --status.");
        const summary = required(parsed.values.summary, "--summary TEXT");
        const runId = required(id, "a run identifier");
        if (!(await inspectPath(root, ".avalon/project.json")).exists) throw new Error("Initialize this project before finishing a run.");
        result = await withStateLock(root, () => finishRun(root, { id: runId, status: status satisfies FinishStatus, summary }));
        break;
      }
      case "resume": {
        const runId = required(id, "a run identifier");
        if (!(await inspectPath(root, ".avalon/project.json")).exists) throw new Error("Initialize this project before resuming a run.");
        result = await withStateLock(root, () => resumeRun(root, runId));
        break;
      }
      default: return assertNever(command);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  } catch (cause) {
    process.stderr.write((cause instanceof Error ? cause.message : "The agent operation cannot complete.") + "\n");
    return cause instanceof UsageError ? 2 : 1;
  }
}
