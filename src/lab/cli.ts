import { parseArgs } from "node:util";
import { auditSnapshots, auditPipeline, buildWitness, contentHash, type AuditReport } from "../audit/engine.js";
import { auditContamination } from "../audit/contamination.js";
import { z } from "zod";
import { parseSnapshotText } from "./contract.js";
import { demoPair, type DemoFault } from "./demo.js";
import { readLocalText, writeLocalText, type OutputDestination } from "./io.js";
import { MAX_AUDIT_REPORT_BYTES, MAX_AUDIT_REPORT_FINDINGS, parseAuditReport, renderAuditMarkdown, renderAuditSarif } from "./report.js";
import { runWorldCommand } from "./world-command.js";
import { parseTraceContract } from "../trace/contract.js";
import { auditTraceContract } from "../trace/audit.js";
import { buildTraceWitness } from "../trace/witness.js";
import { auditTracePair, parseTracePairContract } from "../trace/pair.js";
import { auditTraceHoldout, parseTraceHoldout } from "../trace/holdout.js";
import { runTraceBenchmark } from "../trace/benchmark.js";
import { makeWorldMdp } from "../world/mdp.js";
import { worldTasks } from "../world/tasks.js";

const allowedOptions = {
  audit: ["source", "target", "out", "format", "absolute-tolerance", "relative-tolerance"],
  pipeline: ["source", "recorded", "target", "lineage", "out", "absolute-tolerance", "relative-tolerance"],
  witness: ["source", "target", "finding", "out", "absolute-tolerance", "relative-tolerance"],
  contamination: ["source", "target", "out"],
  snapshot: ["data", "out"], "lab-demo": ["fault", "out", "format"], report: ["data", "out", "format"],
  "world-demo": ["seed", "out"], "world-challenge": ["seed", "out"],
  "world-search": ["seed", "budget", "depth", "out"], "world-benchmark": ["seed", "repetitions", "out"],
  "world-curriculum": ["seed", "budget", "out"], "world-export": ["seed", "out"], "world-run": ["data", "out"],
  "trace-audit": ["data", "contract", "out"],
  "trace-witness": ["data", "contract", "finding", "out"],
  "trace-pair": ["source", "target", "contract", "out"], "trace-holdout": ["data", "out"],
  "trace-benchmark": ["seed", "repetitions", "out"],
  "world-mdp": ["seed", "task", "horizon", "split", "out"],
} as const;
export const LAB_COMMANDS = Object.keys(allowedOptions);
type LabCommand = keyof typeof allowedOptions;
class LabUsageError extends Error {}

function numeric({ value, fallback, max, integer = true }: { value?: string; fallback: number; max: number; integer?: boolean }): number {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!value.trim() || !Number.isFinite(result) || result < 0 || result > max || (integer && !Number.isInteger(result))) {
    throw new LabUsageError("Use a finite number within the documented command limits.");
  }
  return result;
}
function auditCode(status: "pass" | "fail" | "inconclusive"): number {
  switch (status) {
    case "pass": return 0;
    case "fail": return 4;
    case "inconclusive": return 5;
    default: { const impossible: never = status; return impossible; }
  }
}

export async function runLab(args: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, tokens: true, options: {
        source: { type: "string" }, target: { type: "string" }, data: { type: "string" },
        out: { type: "string" }, fault: { type: "string" }, format: { type: "string" },
        recorded: { type: "string" }, lineage: { type: "string" }, finding: { type: "string" },
        seed: { type: "string" }, budget: { type: "string" }, depth: { type: "string" }, repetitions: { type: "string" },
        contract: { type: "string" }, task: { type: "string" }, horizon: { type: "string" },
        split: { type: "string" },
        "absolute-tolerance": { type: "string" }, "relative-tolerance": { type: "string" },
      } });
    } catch { throw new LabUsageError("Check the command options and values."); }
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw new LabUsageError("Use each option only once.");
      seen.add(token.name);
    }
    if (parsed.positionals.length !== 1) throw new LabUsageError("Supply one command.");
    if (!LAB_COMMANDS.includes(parsed.positionals[0] ?? "")) throw new LabUsageError("Select a documented laboratory command.");
    const command = parsed.positionals[0] as LabCommand;
    const allowed: readonly string[] = allowedOptions[command];
    if ([...seen].some(name => !allowed.includes(name))) throw new LabUsageError("The command does not support this option.");
    const path = parsed.values.out;
    if (path !== undefined && !path.trim()) throw new LabUsageError("Supply an output path.");
    const output: OutputDestination = path === undefined || path === "-" ? { type: "stdout" } : { type: "file", path };
    let result: object;
    let audit: AuditReport | undefined;
    const format = parsed.values.format ?? "json";
    if (!["json", "markdown", "sarif"].includes(format)) throw new LabUsageError("Select json, markdown, or sarif.");
    let exitCode = 0;
    const policy = {
      absoluteTolerance: numeric({ value: parsed.values["absolute-tolerance"], fallback: 0, max: Number.MAX_VALUE, integer: false }),
      relativeTolerance: numeric({ value: parsed.values["relative-tolerance"], fallback: 0, max: Number.MAX_VALUE, integer: false }),
    };
    const pair = async () => {
      if (!parsed.values.source?.trim() || !parsed.values.target?.trim()) throw new LabUsageError("Supply --source and --target.");
      return {
        source: parseSnapshotText(await readLocalText(parsed.values.source)),
        target: parseSnapshotText(await readLocalText(parsed.values.target)),
      };
    };
    switch (command) {
      case "audit": {
        const report = auditSnapshots({ ...await pair(), policy });
        result = report;
        audit = report;
        exitCode = auditCode(report.status);
        break;
      }
      case "pipeline": {
        if (!parsed.values.recorded?.trim()) throw new LabUsageError("Pipeline audit requires --recorded.");
        const { source, target } = await pair();
        const recorded = parseSnapshotText(await readLocalText(parsed.values.recorded));
        const lineage = parsed.values.lineage ? z.array(z.object({
          parentSha256: z.string().regex(/^[a-f0-9]{64}$/), childSha256: z.string().regex(/^[a-f0-9]{64}$/),
        }).strict()).length(2).parse(JSON.parse(await readLocalText(parsed.values.lineage)) as unknown) : undefined;
        const report = auditPipeline({ snapshots: [source, recorded, target], policy, lineage });
        result = report; exitCode = auditCode(report.status); break;
      }
      case "witness": {
        if (output.type !== "file") throw new LabUsageError("Witness extraction requires --out because it contains raw evidence.");
        const snapshots = await pair();
        const report = auditSnapshots({ ...snapshots, policy });
        result = buildWitness({ ...snapshots, report, findingIndex: numeric({ value: parsed.values.finding, fallback: 0, max: MAX_AUDIT_REPORT_FINDINGS - 1 }) });
        break;
      }
      case "contamination": {
        const { source, target } = await pair();
        const report = auditContamination({ splits: [{ name: "source", snapshot: source }, { name: "target", snapshot: target }] });
        result = report; exitCode = auditCode(report.status); break;
      }
      case "snapshot": {
        if (!parsed.values.data?.trim()) throw new LabUsageError("Snapshot inspection requires --data.");
        const snapshot = parseSnapshotText(await readLocalText(parsed.values.data));
        result = {
          format: "avalon.snapshot-summary/v1", stage: snapshot.stage, evidence: snapshot.evidence,
          sha256: contentHash(snapshot), episodes: snapshot.episodes.length,
          transitions: snapshot.episodes.reduce((sum, episode) => sum + episode.steps.length, 0),
          limits: ["This summary checks the format. It does not establish task success or data preservation."],
        };
        break;
      }
      case "lab-demo": {
        const fault = parsed.values.fault ?? "reward-shift";
        if (!["none", "reward-shift", "collapsed-ending"].includes(fault)) throw new LabUsageError("Select none, reward-shift, or collapsed-ending.");
        const pair = demoPair({ fault: fault as DemoFault });
        audit = auditSnapshots(pair);
        result = { ...audit, demonstration: { injectedFault: fault, seed: 7 } };
        break;
      }
      case "trace-audit": case "trace-witness": {
        if (!parsed.values.data?.trim() || !parsed.values.contract?.trim()) throw new LabUsageError("Trace auditing requires --data and --contract.");
        const snapshot = parseSnapshotText(await readLocalText(parsed.values.data));
        const contract = parseTraceContract(JSON.parse(await readLocalText(parsed.values.contract)) as unknown);
        if (command === "trace-witness") {
          if (output.type !== "file") throw new LabUsageError("Trace witnesses require a new private output path.");
          result = buildTraceWitness({ snapshot, contract, finding: parsed.values.finding === undefined ? undefined
            : numeric({ value: parsed.values.finding, fallback: 0, max: 2_560_000 }) });
        } else {
          const report = auditTraceContract({ snapshot, contract });
          result = report;
          exitCode = report.status === "match" ? 0 : report.status === "mismatch" ? 4 : 5;
        }
        break;
      }
      case "trace-pair": {
        if (!parsed.values.contract?.trim()) throw new LabUsageError("Paired auditing requires --contract.");
        const contract = parseTracePairContract(JSON.parse(await readLocalText(parsed.values.contract)) as unknown);
        const report = auditTracePair({ ...await pair(), contract });
        result = report;
        exitCode = report.status === "match" ? 0 : report.status === "mismatch" ? 4 : 5;
        break;
      }
      case "trace-holdout": {
        if (!parsed.values.data?.trim()) throw new LabUsageError("Holdout auditing requires --data.");
        const report = auditTraceHoldout({ manifest: parseTraceHoldout(JSON.parse(await readLocalText(parsed.values.data)) as unknown) });
        result = report;
        exitCode = report.status === "match" ? 0 : report.status === "mismatch" ? 4 : 5;
        break;
      }
      case "world-mdp": {
        const task = worldTasks({ seed: numeric({ value: parsed.values.seed, fallback: 7, max: 0xffffffff }) })
          .find(candidate => candidate.id === (parsed.values.task ?? "settle-a"));
        if (!task) throw new LabUsageError("Select a documented operations task.");
        const horizon = numeric({ value: parsed.values.horizon, fallback: 4, max: 6 });
        if (horizon < 1) throw new LabUsageError("Use a horizon from one through six actions.");
        const split = parsed.values.split;
        if (split !== undefined && split !== "train" && split !== "eval") throw new LabUsageError("Select train or eval for the table split.");
        result = makeWorldMdp({ task, horizon, split });
        break;
      }
      case "trace-benchmark": {
        const repetitions = numeric({ value: parsed.values.repetitions, fallback: 5, max: 1_000 });
        if (repetitions < 1) throw new LabUsageError("Use a positive repetition count.");
        result = runTraceBenchmark({ seed: numeric({ value: parsed.values.seed, fallback: 7, max: 0xffffffff }), repetitions });
        break;
      }
      case "report": {
        if (!parsed.values.data?.trim()) throw new LabUsageError("Report export requires --data.");
        audit = parseAuditReport(await readLocalText(parsed.values.data, { maxBytes: MAX_AUDIT_REPORT_BYTES }));
        result = audit;
        break;
      }
      case "world-demo": case "world-challenge": case "world-search": case "world-benchmark":
      case "world-curriculum": case "world-export": case "world-run": {
        if (command === "world-run" && !parsed.values.data?.trim()) throw new LabUsageError("World execution requires --data.");
        const budget = numeric({ value: parsed.values.budget, fallback: command === "world-search" ? 1_000 : 8, max: 10_000 });
        const depth = numeric({ value: parsed.values.depth, fallback: 3, max: 4 });
        const repetitions = numeric({ value: parsed.values.repetitions, fallback: 25, max: 1_000 });
        if (budget < 1 || depth < 1 || repetitions < 1) throw new LabUsageError("Use positive budgets, depths, and repetition counts.");
        result = await runWorldCommand({ command, seed: numeric({ value: parsed.values.seed, fallback: 7, max: 0xffffffff }), budget, depth, repetitions, data: parsed.values.data });
        break;
      }
      default: { const impossible: never = command; return impossible; }
    }
    const text = format === "markdown" && audit ? renderAuditMarkdown(audit)
      : JSON.stringify(format === "sarif" && audit ? renderAuditSarif(audit) : result, null, 2) + "\n";
    await writeLocalText({ output, text });
    return exitCode;
  } catch (cause) {
    if (cause instanceof LabUsageError) {
      process.stderr.write(`${cause.message}\nUsage: node dist/cli.js --help\n`);
      return 2;
    }
    process.stderr.write("The local workflow cannot complete. Check the documented input and output paths.\n");
    return 1;
  }
}
