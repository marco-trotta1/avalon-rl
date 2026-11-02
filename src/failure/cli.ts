import { parseArgs } from "node:util";
import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import { readLocalText, writeLocalText } from "../lab/io.js";
import { demoFailureCase, failureCaseHash, parseFailureCase } from "./case.js";
import { compareFailureCases, evaluateFailureSnapshot, parseFailureCandidates, replayFailureCase } from "./replay.js";
import { prepareFailurePackage } from "./package.js";
import { createFailureEnvironment, readFailureEnvironment } from "./environment.js";

const help = `Avalon failures: capture a failure and test a repair locally.

Usage:
  avalon failure demo [--out case.json]
  avalon failure capture --data case.json --out captured.json
  avalon failure replay --data case.json [--out report.json]
  avalon failure environment --data case.json --directory fresh-directory
  avalon failure grade --data case.json --directory candidate-directory [--out report.json]
  avalon failure compare --data cases.json --candidates candidates.json [--split split.json] [--out report.json]
  avalon failure package --data case.json --use evaluation|training|redistribution --review review.json --out package.json

The environment contains initial files only. Keep the case outside the candidate directory.
Run the candidate with your own agent, then grade its files.
Replay checks recorded snapshots. It does not execute the original model or train a model.
Outputs are private. Existing files and directories are preserved.
Each JSON input is limited to 10 MiB. No command uploads data or makes payments.
Exit codes: 0 complete, 1 input or file error, 2 usage error, 4 candidate fails, 5 unresolved or blocked.
Read docs/failures.md for the workflow and limitations.
`;

class UsageError extends Error {}
const splitSchema = z.strictObject({ developmentFamilyIds: z.array(z.string()), holdoutFamilyIds: z.array(z.string()) });
async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readLocalText(path, { maxBytes: 10_485_760 })) as unknown;
}

export async function runFailure(args: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, strict: true, allowPositionals: true, tokens: true, options: {
        help: { type: "boolean", short: "h" }, data: { type: "string" }, out: { type: "string" },
        directory: { type: "string" }, candidates: { type: "string" }, split: { type: "string" },
        use: { type: "string" }, review: { type: "string" },
      } });
    } catch { throw new UsageError("Use the documented failure options."); }
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw new UsageError("Use each option once.");
      seen.add(token.name);
    }
    if (parsed.values.help || args.length === 0) { process.stdout.write(help); return 0; }
    const command = parsed.positionals[0];
    const allowed: Record<string, string[]> = {
      demo: ["out"], capture: ["data", "out"], replay: ["data", "out"],
      environment: ["data", "directory"], grade: ["data", "directory", "out"],
      compare: ["data", "candidates", "split", "out"], package: ["data", "use", "review", "out"],
    };
    if (parsed.positionals.length !== 1 || command === undefined || !Object.hasOwn(allowed, command)) {
      throw new UsageError("Select a command from failure --help.");
    }
    if ([...seen].some(name => !allowed[command]!.includes(name))) throw new UsageError("The command does not support this option.");
    for (const value of Object.values(parsed.values)) {
      if (typeof value === "string" && !value.trim()) throw new UsageError("Supply nonempty option values.");
    }
    const required = (name: "data" | "out" | "directory" | "candidates" | "use" | "review"): string => {
      const value = parsed.values[name];
      if (value === undefined) throw new UsageError(`Supply --${name}.`);
      return value;
    };
    let report: unknown;
    let code = 0;
    if (command === "demo") report = demoFailureCase();
    else if (command === "compare") {
      const cases = z.array(z.unknown()).min(1).max(1000).parse(await readJson(required("data"))).map(parseFailureCase);
      const candidates = parseFailureCandidates(await readJson(required("candidates")));
      const split = parsed.values.split === undefined ? undefined : splitSchema.parse(await readJson(parsed.values.split));
      report = compareFailureCases({ cases, candidates, split });
    } else {
      const failureCase = parseFailureCase(await readJson(required("data")));
      switch (command) {
        case "capture": required("out"); report = failureCase; break;
        case "replay": {
          const replay = replayFailureCase(failureCase);
          report = replay;
          code = replay.status === "reproducible" ? 0 : 5;
          break;
        }
        case "environment":
          await createFailureEnvironment({ failureCase, directory: required("directory") });
          report = { format: "avalon.failure-environment.v1", caseHash: failureCaseHash(failureCase), status: "created" };
          break;
        case "grade": {
          const files = await readFailureEnvironment({ failureCase, directory: required("directory") });
          const result = evaluateFailureSnapshot({ failureCase, files });
          report = { format: "avalon.failure-grade.v1", caseHash: failureCaseHash(failureCase), candidateHash: contentHash(files), ...result };
          code = result.status === "pass" ? 0 : 4;
          break;
        }
        case "package": {
          required("out");
          const requestedUse = z.enum(["evaluation", "training", "redistribution"]).parse(required("use"));
          const result = prepareFailurePackage({ case: failureCase, requestedUse, review: await readJson(required("review")) });
          report = result;
          code = result.status === "ready" ? 0 : 5;
          break;
        }
        default: throw new UsageError("Select a command from failure --help.");
      }
    }
    await writeLocalText({
      output: parsed.values.out === undefined || parsed.values.out === "-" ? { type: "stdout" } : { type: "file", path: parsed.values.out },
      text: JSON.stringify(report, null, 2) + "\n",
    });
    return code;
  } catch (error) {
    process.stderr.write(error instanceof UsageError ? error.message + "\n" : "The failure command cannot complete. Check the input format, permissions, and output paths.\n");
    return error instanceof UsageError ? 2 : 1;
  }
}
