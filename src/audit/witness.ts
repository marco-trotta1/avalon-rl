import type { Snapshot } from "../lab/contract.js";
import { auditSnapshots, contentHash, type AuditFinding, type AuditReport } from "./engine.js";

export interface AuditWitness {
  format: "avalon.audit-witness/v1";
  privacy: "private-evidence";
  original: { sourceSha256: string; targetSha256: string };
  selected: AuditFinding;
  source: Snapshot;
  target: Snapshot;
  sourceOrdinals: number[];
  targetOrdinals: number[];
  report: AuditReport;
  reductionChecks: number;
  reductionLimitReached: boolean;
  limits: string[];
}

interface Candidate {
  source: Snapshot;
  target: Snapshot;
  sourceOrdinals: number[];
  targetOrdinals: number[];
}

export function buildWitness({ source, target, report, findingIndex = 0 }: {
  source: Snapshot;
  target: Snapshot;
  report: AuditReport;
  findingIndex?: number;
}): AuditWitness {
  if (contentHash(source) !== report.source.sha256 || contentHash(target) !== report.target.sha256) throw new Error("Use the exact snapshots that produced the report.");
  if (!Number.isInteger(findingIndex) || findingIndex < 0) throw new Error("Select an existing audit finding.");
  const selected = report.findings[findingIndex];
  if (!selected) throw new Error("Select an existing audit finding.");
  let candidate: Candidate = {
    source,
    target,
    sourceOrdinals: source.episodes.map((_episode, index) => index + 1),
    targetOrdinals: target.episodes.map((_episode, index) => index + 1),
  };
  const reproduces = (state: Candidate, audit: AuditReport): boolean => audit.findings.some(finding => {
    const originalEpisode = finding.episode === undefined ? undefined : state.sourceOrdinals[finding.episode - 1];
    return finding.code === selected.code && finding.severity === selected.severity && originalEpisode === selected.episode && finding.step === selected.step && finding.field === selected.field && finding.expectedHash === selected.expectedHash && finding.actualHash === selected.actualHash;
  });
  let currentReport = auditSnapshots({ source, target, policy: report.policy });
  if (!reproduces(candidate, currentReport)) throw new Error("The selected finding does not reproduce from the supplied evidence.");
  let reductionChecks = 0;
  const tryCandidate = (next: Candidate): boolean => {
    if (reductionChecks >= 64) return false;
    reductionChecks += 1;
    const audit = auditSnapshots({ source: next.source, target: next.target, policy: report.policy });
    if (!reproduces(next, audit)) return false;
    candidate = next;
    currentReport = audit;
    return true;
  };
  for (const side of ["source", "target"] as const) {
    const ordinals = side === "source" ? "sourceOrdinals" : "targetOrdinals";
    let episodeOffset = 0;
    while (candidate[side].episodes.length > 1 && episodeOffset < candidate[side].episodes.length && reductionChecks < 64) {
      const next = { ...candidate, [side]: { ...candidate[side], episodes: candidate[side].episodes.filter((_episode, index) => index !== episodeOffset) }, [ordinals]: candidate[ordinals].filter((_ordinal, index) => index !== episodeOffset) };
      if (!tryCandidate(next)) episodeOffset += 1;
    }
    for (let index = 0; index < candidate[side].episodes.length && reductionChecks < 64; index += 1) {
      let stepOffset = 0;
      let episode = candidate[side].episodes[index];
      while (episode && episode.steps.length > 1 && stepOffset < episode.steps.length && reductionChecks < 64) {
        const reduced = { ...episode, steps: episode.steps.filter((_step, offset) => offset !== stepOffset) };
        const next = { ...candidate, [side]: { ...candidate[side], episodes: candidate[side].episodes.map((item, offset) => offset === index ? reduced : item) } };
        if (!tryCandidate(next)) stepOffset += 1;
        episode = candidate[side].episodes[index];
      }
    }
  }
  return structuredClone({
    format: "avalon.audit-witness/v1",
    privacy: "private-evidence",
    original: { sourceSha256: report.source.sha256, targetSha256: report.target.sha256 },
    selected,
    ...candidate,
    report: currentReport,
    reductionChecks,
    reductionLimitReached: reductionChecks >= 64,
    limits: ["The witness contains raw selected evidence. Keep it private.", "The reduction preserves the selected finding. It can introduce unknown coverage findings.", "The deterministic reduction makes at most 64 removal checks. It does not prove global minimality."],
  });
}
