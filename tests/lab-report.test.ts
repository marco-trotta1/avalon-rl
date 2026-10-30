import { describe, expect, it } from "vitest";
import { auditSnapshots } from "../src/audit/engine.js";
import { demoPair } from "../src/lab/demo.js";
import { parseAuditReport, renderAuditMarkdown, renderAuditSarif } from "../src/lab/report.js";

describe("report exports", () => {
  it("preserves the status and evidence across saved report imports", () => {
    const report = auditSnapshots(demoPair({ fault: "reward-shift" }));
    expect(parseAuditReport(JSON.stringify(report))).toEqual(report);
    expect(() => parseAuditReport(JSON.stringify({ ...report, status: "pass" }))).toThrow("consistent");
    expect(() => parseAuditReport(JSON.stringify({ ...report, summary: { ...report.summary, errors: 0 } }))).toThrow("consistent");
  });
  it("creates SARIF results with rule IDs and private field fingerprints", () => {
    const report = auditSnapshots(demoPair({ fault: "reward-shift" }));
    expect(renderAuditSarif(report)).toMatchObject({ version: "2.1.0", runs: [{ results: [{ ruleId: "transition.changed", level: "error" }], properties: { evidence: "synthetic" } }] });
    expect(JSON.stringify(renderAuditSarif(report))).not.toContain("counter-7");
  });
  it("escapes supplied Markdown and retains incomplete evidence", () => {
    const report = auditSnapshots(demoPair({ fault: "none" }));
    report.source.producer.name = "![private](remote-resource) | injected";
    report.status = "inconclusive";
    report.summary.unknowns = 1;
    report.findings.push({ code: "missing.evidence", severity: "unknown", message: "The input is incomplete." });
    const text = renderAuditMarkdown(report);
    expect(text).toContain("inconclusive");
    expect(text).toContain("\\!\\[private\\]\\(remote-resource\\) \\| injected");
    expect(text).toContain("missing.evidence");
  });
  it.each(["\r", "\n", "\r\n"])("flattens %j separators before escaping supplied Markdown", separator => {
    const report = auditSnapshots(demoPair({ fault: "none" }));
    const label = ["source-label", "---", "![private](remote-resource)"].join(separator);
    report.source.producer.name = label;
    report.limits.push(label);
    report.summary.warnings = 1;
    report.findings.push({ code: "supplied.label", severity: "warning", field: label, message: label });
    const text = renderAuditMarkdown(report);
    expect(text).toContain("Source: source-label --- \\!\\[private\\]\\(remote-resource\\) 1 (source).");
    expect(text).toContain("| source-label --- \\!\\[private\\]\\(remote-resource\\) | source-label --- \\!\\[private\\]\\(remote-resource\\) |");
    expect(text).toContain("- source-label --- \\!\\[private\\]\\(remote-resource\\)");
    expect(text).not.toContain("\r");
  });
});
