import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { MAX_FILE_BYTES } from "../lib/schema.js";
import { readLocalText, writeLocalText } from "../lab/io.js";
import { parseSelection, selectCandidates } from "./selection.js";

const help = `Select a frozen candidate with a bounded Hoeffding comparison.

Usage:
  avalon select --plan selection-plan.json --scores selection-scores.json [--out report.json]

Use a fixed roster, known score bounds, and a fixed evaluation budget.
Read docs/selection.md for the sampling assumptions and JSON formats.
Each input must be a regular UTF-8 file of at most 10 MiB, without a byte order mark.
The scores bind the SHA-256 of the exact plan file bytes.
Existing output files are preserved. New outputs use owner-only permissions.
Exit codes: 0 selected, 1 file or data error, 2 usage error, 5 inconclusive.
`;

class UsageError extends Error {}

export async function runSelection(args: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
        help: { type: "boolean", short: "h" }, plan: { type: "string" }, scores: { type: "string" }, out: { type: "string" },
      } });
    } catch { throw new UsageError("Use select --plan FILE --scores FILE with the documented options."); }
    const seen = new Set<string>();
    for (const token of parsed.tokens) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw new UsageError("Use each selection option once.");
      seen.add(token.name);
    }
    if (parsed.values.help) { process.stdout.write(help); return 0; }
    if (!parsed.values.plan?.trim() || !parsed.values.scores?.trim()) throw new UsageError("Supply --plan FILE and --scores FILE.");
    if (parsed.values.out !== undefined && !parsed.values.out.trim()) throw new UsageError("Supply a nonempty output path.");
    const [planText, scoresText] = await Promise.all([
      readLocalText(parsed.values.plan, { maxBytes: MAX_FILE_BYTES, preserveBOM: true }),
      readLocalText(parsed.values.scores, { maxBytes: MAX_FILE_BYTES, preserveBOM: true }),
    ]);
    const planSha256 = createHash("sha256").update(planText).digest("hex");
    const report = selectCandidates(parseSelection({
      plan: JSON.parse(planText) as unknown, scores: JSON.parse(scoresText) as unknown, planSha256,
    }));
    await writeLocalText({
      output: parsed.values.out === undefined || parsed.values.out === "-" ? { type: "stdout" } : { type: "file", path: parsed.values.out },
      text: JSON.stringify(report, null, 2) + "\n",
    });
    return report.decision.status === "selected" ? 0 : 5;
  } catch (cause) {
    const message = cause instanceof SyntaxError ? "Use valid JSON in the selection inputs."
      : cause instanceof Error ? cause.message : "The selection cannot complete.";
    process.stderr.write(message + "\n");
    return cause instanceof UsageError ? 2 : 1;
  }
}
