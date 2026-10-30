#!/usr/bin/env node
import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { aggregateReport, analyzeData, estimateValue, type Analysis } from "./lib/engine.js";
import { blankCase, demoCase, demoData } from "./lib/demo.js";
import { assertNever, MAX_FILE_BYTES, parseCase } from "./lib/schema.js";
import { LAB_COMMANDS, runLab } from "./lab/cli.js";

type Kind = Analysis["kind"];
type Output = { type: "stdout" } | { type: "file"; path: string };
type Command =
  | { type: "help" }
  | { type: "inspect"; kind: Kind; dataPath: string; output: Output }
  | { type: "appraise"; casePath: string; dataPath: string; output: Output }
  | { type: "template"; kind: Kind; output: Output }
  | { type: "demo"; kind: Kind; output: Output };

class UsageError extends Error {}
class FileError extends Error {}

const help = `Avalon RL: a local laboratory for agent experience and learning worlds.

Usage:
  node dist/cli.js audit --source source.json --target learner.json [--format json|html|markdown|sarif] [--out audit.json]
  node dist/cli.js report --data audit.json [--format json|html|markdown|sarif] [--out report.html]
  node dist/cli.js pipeline --source source.json --recorded recorded.json --target learner.json [--lineage links.json]
  node dist/cli.js witness --source source.json --target learner.json --out witness.json
  node dist/cli.js contamination --source train.json --target eval.json
  node dist/cli.js world-demo|world-challenge|world-export [--seed 7] [--out report.json]
  node dist/cli.js world-search [--seed 7] [--budget 1000] [--depth 3]
  node dist/cli.js world-benchmark [--seed 7] [--repetitions 25]
  node dist/cli.js world-curriculum [--seed 7] [--budget 8]
  node dist/cli.js world-run --data action-plan.json
  node dist/cli.js snapshot --data snapshot.json [--out summary.json]
  node dist/cli.js lab-demo [--fault none|reward-shift|collapsed-ending] [--format json|html] [--out audit.json]
  node dist/cli.js appraise --case appraisal.json --data asset-file [--out report.json]
  node dist/cli.js inspect --kind traces|environment --data asset-file [--out report.json]
  node dist/cli.js template [--kind traces|environment] [--out appraisal.json]
  node dist/cli.js demo [--kind traces|environment] [--out report.json]

Output is JSON. Without --out, output goes to stdout.
Template and demo use traces unless --kind selects environment.
Existing output files are never replaced. New files use owner-only permissions.
The script reads local files. It does not start a server or call external services.
Inputs use the formats in docs/formats.md. Each file must not exceed 10 MiB.
Real estimates require documented comparable transactions. Demo prices are invented.

Exit codes: 0 complete, 1 file or data error, 2 usage error, 3 price withheld, 4 audit fails, 5 audit inconclusive.
The lab-demo command completes with code 0, including an expected injected fault.
`;

function parseCommand(args: string[]): Command {
  let parsed;
  try {
    parsed = parseArgs({
      args, allowPositionals: true, strict: true, tokens: true,
      options: {
        help: { type: "boolean", short: "h" },
        case: { type: "string" }, data: { type: "string" },
        kind: { type: "string" }, out: { type: "string" },
      },
    });
  } catch { throw new UsageError("Check the option names and values."); }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new UsageError("Use each option only once.");
    seen.add(token.name);
  }
  if (parsed.values.help || args.length === 0) return { type: "help" };
  if (parsed.positionals.length !== 1) throw new UsageError("Supply one command.");
  const type = parsed.positionals[0];
  const allowed = type === "appraise" ? ["case", "data", "out"]
    : type === "inspect" ? ["kind", "data", "out"] : ["kind", "out"];
  if ([...seen].some(name => !allowed.includes(name))) throw new UsageError("The command does not support this option.");
  const output: Output = parsed.values.out === undefined || parsed.values.out === "-"
    ? { type: "stdout" } : { type: "file", path: parsed.values.out };
  if (output.type === "file" && !output.path.trim()) throw new UsageError("Supply an output path.");
  const dataPath = parsed.values.data;
  if (type === "appraise") {
    const casePath = parsed.values.case;
    if (!casePath?.trim() || !dataPath?.trim()) throw new UsageError("Appraisal requires --case and --data.");
    return { type, casePath, dataPath, output };
  }
  const kind = parsed.values.kind ?? (type === "inspect" ? undefined : "traces");
  if (kind !== "traces" && kind !== "environment") throw new UsageError("Select --kind traces or --kind environment.");
  switch (type) {
    case "inspect":
      if (!dataPath?.trim()) throw new UsageError("Inspection requires --data.");
      return { type, kind, dataPath, output };
    case "template":
    case "demo": return { type, kind, output };
    default: throw new UsageError("Select appraise, inspect, template, or demo.");
  }
}

async function readInput(input: { path: string; label: "appraisal" | "data" }): Promise<string> {
  try {
    const file = await open(input.path, "r");
    try {
      if (!(await file.stat()).isFile()) throw new FileError(`The ${input.label} input must be a regular file.`);
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > MAX_FILE_BYTES) throw new FileError(`The ${input.label} file exceeds 10 MiB.`);
      try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)); }
      catch { throw new FileError(`Use valid UTF-8 in the ${input.label} file.`); }
    } finally { await file.close(); }
  } catch (cause) {
    if (cause instanceof FileError) throw cause;
    throw new FileError(`Cannot read the ${input.label} file. Check the path and permissions.`);
  }
}

async function writeOutput(input: { output: Output; value: object }): Promise<void> {
  const content = JSON.stringify(input.value, null, 2) + "\n";
  switch (input.output.type) {
    case "stdout": process.stdout.write(content); return;
    case "file":
      try {
        const file = await open(input.output.path, "wx", 0o600);
        try { await file.writeFile(content, "utf8"); }
        finally { await file.close(); }
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST") {
          throw new FileError("The output file already exists. Select a new output path.");
        }
        throw new FileError("Cannot write the report. Check the output directory and permissions.");
      }
      process.stderr.write("The private report is written.\n");
      return;
    default: return assertNever(input.output);
  }
}

async function main(args: string[]): Promise<number> {
  if (LAB_COMMANDS.includes(args[0] ?? "")) return runLab(args);
  try {
    const command = parseCommand(args);
    switch (command.type) {
      case "help": process.stdout.write(help); return 0;
      case "template": {
        const value: object = JSON.parse(blankCase(command.kind));
        await writeOutput({ output: command.output, value });
        return 0;
      }
      case "inspect": {
        const text = await readInput({ path: command.dataPath, label: "data" });
        const analysis = await analyzeData({ text, kind: command.kind });
        await writeOutput({ output: command.output, value: {
          format: "avalon-rl-inspection-v1", analysis,
          sensitivity: "Private. This report contains aggregate counts and a source fingerprint.",
          limits: command.kind === "environment"
            ? "Static task inspection only. Declared test receipts are not verified. Environment code does not run."
            : "Structural inspection only. Task success, training utility, and semantic novelty are not measured.",
        } });
        return 0;
      }
      case "appraise":
      case "demo": {
        const appraisal = command.type === "demo" ? demoCase(command.kind)
          : parseCase((await readInput({ path: command.casePath, label: "appraisal" })).replace(/^\uFEFF/, ""));
        const text = command.type === "demo" ? demoData(command.kind)
          : await readInput({ path: command.dataPath, label: "data" });
        const analysis = await analyzeData({ text, kind: appraisal.asset.kind });
        const estimate = estimateValue({ appraisal, analysis });
        await writeOutput({ output: command.output, value: aggregateReport({ appraisal, analysis, estimate }) });
        return estimate.status === "estimated" ? 0 : 3;
      }
      default: return assertNever(command);
    }
  } catch (cause) {
    if (cause instanceof UsageError) {
      process.stderr.write(`${cause.message}\nUsage: node dist/cli.js --help\n`);
      return 2;
    }
    const message = cause instanceof FileError ? cause.message
      : "The input cannot be analyzed. Check the documented format and record limits.";
    process.stderr.write(message + "\n");
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
