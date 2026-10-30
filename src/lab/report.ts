import { z } from "zod";
import type { AuditReport } from "../audit/engine.js";

export const MAX_AUDIT_REPORT_BYTES = 256 * 1024 * 1024;
export const MAX_AUDIT_REPORT_FINDINGS = 500_000;

const count = z.number().int().nonnegative().max(1_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stage = z.object({
  sha256: hash, stage: z.enum(["source", "recorded", "learner"]),
  producer: z.object({ name: z.string().max(240), version: z.string().max(240) }).strict(),
}).strict();
const reportSchema = z.object({
  format: z.literal("avalon.audit/v1"), status: z.enum(["pass", "fail", "inconclusive"]),
  source: stage, target: stage, evidence: z.enum(["synthetic", "user-supplied"]),
  summary: z.object({ sourceEpisodes: count, targetEpisodes: count, comparedSteps: count, errors: count, warnings: count, unknowns: count }).strict(),
  policy: z.object({ absoluteTolerance: z.number().finite().nonnegative(), relativeTolerance: z.number().finite().nonnegative() }).strict(),
  findings: z.array(z.object({
    code: z.string().min(1).max(120), severity: z.enum(["error", "warning", "unknown"]),
    episode: count.positive().optional(), targetEpisode: count.positive().optional(), step: count.optional(), field: z.string().max(500).optional(),
    message: z.string().max(5000), expectedHash: hash.optional(), actualHash: hash.optional(),
  }).strict()).max(MAX_AUDIT_REPORT_FINDINGS),
  limits: z.array(z.string().max(5000)).max(100),
  demonstration: z.object({ injectedFault: z.string().max(240), seed: count }).strict().optional(),
}).strict().superRefine((report, context) => {
  const errors = report.findings.filter(finding => finding.severity === "error").length;
  const warnings = report.findings.filter(finding => finding.severity === "warning").length;
  const unknowns = report.findings.filter(finding => finding.severity === "unknown").length;
  const status = errors > 0 ? "fail" : unknowns > 0 ? "inconclusive" : "pass";
  if (report.summary.errors !== errors || report.summary.warnings !== warnings || report.summary.unknowns !== unknowns || report.status !== status) {
    context.addIssue({ code: "custom", message: "The report summary must agree with its findings." });
  }
});

export function parseAuditReport(text: string): AuditReport {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("The report must contain valid JSON."); }
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) throw new Error("Use a consistent Avalon audit report.");
  return parsed.data;
}

function markdown(value: string | number): string {
  return String(value).replace(/\r\n|\r|\n/g, " ").replace(/([\\`*_[\]{}()<>!|#])/g, "\\$1");
}

export function renderAuditMarkdown(report: AuditReport): string {
  const findings = report.findings.map(finding => `| ${markdown(finding.severity)} | ${markdown(finding.code)} | ${finding.episode ?? "All"} | ${finding.targetEpisode ?? "All"} | ${finding.step ?? "All"} | ${markdown(finding.field ?? "record")} | ${markdown(finding.message)} |`).join("\n");
  return `# Avalon experience audit

Status: ${report.status}. Evidence: ${report.evidence}.

Source: ${markdown(report.source.producer.name)} ${markdown(report.source.producer.version)} (${report.source.stage}).
Target: ${markdown(report.target.producer.name)} ${markdown(report.target.producer.version)} (${report.target.stage}).

Compared transitions: ${report.summary.comparedSteps}.
Errors: ${report.summary.errors}. Warnings: ${report.summary.warnings}. Unknowns: ${report.summary.unknowns}.

| Severity | Code | Source episode | Target episode | Step | Field | Finding |
| --- | --- | --- | --- | --- | --- | --- |
${findings || "| None | No findings | All | All | All | All | The supplied evidence agrees. |"}

Absolute tolerance: ${report.policy.absoluteTolerance}. Relative tolerance: ${report.policy.relativeTolerance}.

Source SHA-256: \`${report.source.sha256}\`.
Target SHA-256: \`${report.target.sha256}\`.

${report.limits.map(limit => `- ${markdown(limit)}`).join("\n")}

Keep this report private. A passing comparison does not establish training improvement.
`;
}

export function renderAuditSarif(report: AuditReport): object {
  const codes = [...new Set(report.findings.map(finding => finding.code))];
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Avalon", rules: codes.map(id => ({ id, shortDescription: { text: id } })) } },
      results: report.findings.map(finding => ({
        ruleId: finding.code,
        level: finding.severity === "error" ? "error" : finding.severity === "warning" ? "warning" : "note",
        message: { text: finding.message },
        properties: { episode: finding.episode, targetEpisode: finding.targetEpisode, step: finding.step, field: finding.field, expectedHash: finding.expectedHash, actualHash: finding.actualHash },
      })),
      properties: { status: report.status, evidence: report.evidence, sourceSha256: report.source.sha256, targetSha256: report.target.sha256, policy: report.policy, limits: report.limits },
    }],
  };
}
