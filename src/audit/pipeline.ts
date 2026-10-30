import type { Snapshot } from "../lab/contract.js";
import { auditSnapshots, contentHash, resolvePolicy, type AuditFinding, type AuditPolicy, type AuditReport } from "./engine.js";

export interface PipelineReport {
  format: "avalon.pipeline-audit/v1";
  status: AuditReport["status"];
  policy: AuditPolicy;
  snapshots: AuditReport["source"][];
  edges: { from: number; to: number; report: AuditReport }[];
  sourceComparisons: { to: number; report: AuditReport }[];
  findings: (AuditFinding & { snapshot?: number })[];
  firstDivergence: { from: number; to: number } | null;
  evidence: Snapshot["evidence"];
  limits: string[];
}

export function auditPipeline({ snapshots, policy: inputPolicy, lineage }: {
  snapshots: readonly Snapshot[];
  policy?: AuditPolicy;
  lineage?: readonly { parentSha256: string; childSha256: string }[];
}): PipelineReport {
  const source = snapshots[0];
  if (!source || snapshots.length < 2) throw new Error("Supply at least two snapshots in pipeline order.");
  const policy = resolvePolicy(inputPolicy);
  const findings: PipelineReport["findings"] = [];
  const rank = { source: 0, recorded: 1, learner: 2 } as const;
  if (!snapshots.some(snapshot => snapshot.stage === "recorded") || source.stage !== "source" || snapshots.at(-1)?.stage !== "learner") {
    findings.push({ code: "pipeline.coverage.unknown", severity: "unknown", message: "The evidence does not cover source, recorded, and learner stages in pipeline order." });
  }
  if (!lineage) findings.push({ code: "lineage.unknown", severity: "unknown", message: "The evidence omits explicit artifact hash links." });
  else if (lineage.length !== snapshots.length - 1) findings.push({ code: "lineage.coverage", severity: "error", message: "The hash links do not cover every pipeline edge." });
  const edges: PipelineReport["edges"] = [];
  const sourceComparisons: PipelineReport["sourceComparisons"] = [];
  snapshots.forEach((snapshot, offset) => {
    if (snapshot.seed !== source.seed) findings.push({ code: "lineage.seed.changed", severity: "error", snapshot: offset + 1, message: "The snapshot seed differs from the source seed." });
    const previous = snapshots[offset - 1];
    if (!previous) return;
    if (rank[snapshot.stage] < rank[previous.stage]) findings.push({ code: "pipeline.stage.order", severity: "error", snapshot: offset + 1, message: "The pipeline stages move backwards." });
    if (previous.evidence === "user-supplied" && snapshot.evidence === "synthetic") findings.push({ code: "lineage.evidence.changed", severity: "error", snapshot: offset + 1, message: "The target relabels user-supplied evidence as synthetic." });
    const link = lineage?.[offset - 1];
    if (lineage && (!link || link.parentSha256 !== contentHash(previous) || link.childSha256 !== contentHash(snapshot))) {
      findings.push({ code: "lineage.hash.changed", severity: "error", snapshot: offset + 1, message: "The declared hash link does not bind the adjacent snapshots." });
    }
    edges.push({ from: offset, to: offset + 1, report: auditSnapshots({ source: previous, target: snapshot, policy }) });
    sourceComparisons.push({ to: offset + 1, report: auditSnapshots({ source, target: snapshot, policy }) });
  });
  const reports = [...edges.map(edge => edge.report), ...sourceComparisons.map(comparison => comparison.report)];
  const firstEdge = edges.find(edge => edge.report.status === "fail" || sourceComparisons.find(comparison => comparison.to === edge.to)?.report.status === "fail" || findings.some(finding => finding.severity === "error" && finding.snapshot === edge.to));
  const fail = findings.some(finding => finding.severity === "error") || reports.some(report => report.status === "fail");
  const unknown = findings.some(finding => finding.severity === "unknown") || reports.some(report => report.status === "inconclusive");
  return {
    format: "avalon.pipeline-audit/v1",
    status: fail ? "fail" : unknown ? "inconclusive" : "pass",
    policy,
    snapshots: snapshots.map(snapshot => ({ sha256: contentHash(snapshot), stage: snapshot.stage, producer: { ...snapshot.producer } })),
    edges,
    sourceComparisons,
    findings,
    firstDivergence: firstEdge ? { from: firstEdge.from, to: firstEdge.to } : null,
    evidence: snapshots.every(snapshot => snapshot.evidence === "synthetic") ? "synthetic" : "user-supplied",
    limits: ["The first divergence is the first failing edge, including its comparison against the original source.", "Hash links bind supplied artifacts. They do not prove process execution or external provenance."],
  };
}
