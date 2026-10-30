import { parseArgs } from "node:util";
import { auditSnapshots, contentHash, type AuditReport } from "../audit/engine.js";
import { parseSnapshotText } from "./contract.js";
import { demoPair, type DemoFault } from "./demo.js";
import { readLocalText, writeLocalText, type OutputDestination } from "./io.js";
import { renderAuditHtml } from "./html.js";

export const LAB_COMMANDS = ["audit", "snapshot", "lab-demo"];
class LabUsageError extends Error {}

export async function runLab(args: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, tokens: true, options: {
        source: { type: "string" }, target: { type: "string" }, data: { type: "string" },
        out: { type: "string" }, fault: { type: "string" }, format: { type: "string" },
      } });
    } catch { throw new LabUsageError("Check the command options and values."); }
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw new LabUsageError("Use each option only once.");
      seen.add(token.name);
    }
    if (parsed.positionals.length !== 1) throw new LabUsageError("Supply one command.");
    const command = parsed.positionals[0];
    const allowed = command === "audit" ? ["source", "target", "out", "format"]
      : command === "snapshot" ? ["data", "out"] : ["fault", "out", "format"];
    if ([...seen].some(name => !allowed.includes(name))) throw new LabUsageError("The command does not support this option.");
    const path = parsed.values.out;
    if (path !== undefined && !path.trim()) throw new LabUsageError("Supply an output path.");
    const output: OutputDestination = path === undefined || path === "-" ? { type: "stdout" } : { type: "file", path };
    let result: object;
    let audit: AuditReport | undefined;
    const format = parsed.values.format ?? "json";
    if (format !== "json" && format !== "html") throw new LabUsageError("Select --format json or --format html.");
    let exitCode = 0;
    switch (command) {
      case "audit": {
        if (!parsed.values.source?.trim() || !parsed.values.target?.trim()) throw new LabUsageError("Audit requires --source and --target.");
        const source = parseSnapshotText(await readLocalText(parsed.values.source));
        const target = parseSnapshotText(await readLocalText(parsed.values.target));
        const report = auditSnapshots({ source, target });
        result = report;
        audit = report;
        exitCode = report.status === "fail" ? 4 : report.status === "inconclusive" ? 5 : 0;
        break;
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
      default: throw new LabUsageError("Select audit, snapshot, or lab-demo.");
    }
    await writeLocalText({ output, text: format === "html" && audit ? renderAuditHtml(audit) : JSON.stringify(result, null, 2) + "\n" });
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
