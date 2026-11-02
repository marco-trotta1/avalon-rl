import type { runTrial } from "./run.js";

export function renderTrialSummary(report: ReturnType<typeof runTrial>): string {
  const rows = report.comparisons.map(row =>
    `| ${row.split} | ${row.origin} | ${row.avalon.samples} | ${row.baseline.agreements} | ${row.avalon.agreements} | ${row.avalon.unknowns} |`);
  return [
    "# Private trial review", "",
    `Trial hash: ${report.trialHash}`, "",
    "These counts measure agreement with supplied labels. They do not establish general detection accuracy.", "",
    "| Split | Origin | Cases | Baseline agreements | Avalon agreements | Avalon unknowns |",
    "| --- | --- | ---: | ---: | ---: | ---: |", ...rows, "",
    "See report.json for individual timings, execution costs, checks, and private witnesses.",
    "The baseline applies simpler rules through the same checker.",
    "See collection.json for the adapter's independent baseline, outcome judgments, and replay results.", "",
    "## Decision checklist", "",
    "- Confirm that the owner reviews the success rules and outcome labels.",
    "- Confirm that fresh-reset replay matches the recorded actions and observations.",
    "- Review unknown outcomes and failed requests before drawing conclusions.",
    "- Compare engineering time with the team's ordinary regression test.",
    "- Ask the team to rerun the test after an agent change.",
    "- Record whether the team chooses to continue.", "",
    "## Limits", "", ...report.limits.map(limit => `- ${limit}`), "",
  ].join("\n");
}
