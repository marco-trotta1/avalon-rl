import type { EpisodeSnapshot, Snapshot, Step } from "../lab/contract.js";
import { contentHash } from "./engine.js";

export interface ContentOccurrence {
  split: number;
  episode: number;
  step?: number;
}

export interface ContaminationReport {
  format: "avalon.contamination/v1";
  status: "pass" | "fail" | "inconclusive";
  splits: { ordinal: number; nameHash: string; sha256: string; episodes: number }[];
  duplicates: { kind: "episode" | "transition"; sha256: string; severity: "error" | "warning"; occurrences: ContentOccurrence[] }[];
  evidence: Snapshot["evidence"];
  limits: string[];
}

function transitionContent(step: Step) {
  return {
    observation: step.observation,
    action: step.action,
    reward: step.reward,
    next_observation: step.next_observation,
    terminated: step.terminated,
    truncated: step.truncated,
  };
}

export function transitionFingerprint(step: Step): string {
  return contentHash(transitionContent(step));
}

export function episodeFingerprint(episode: EpisodeSnapshot): string {
  return contentHash(episode.steps.map(transitionContent));
}

export function auditContamination({ splits }: {
  splits: readonly { name: string; snapshot: Snapshot }[];
}): ContaminationReport {
  if (splits.length < 1 || splits.some(split => split.name.trim().length < 1)) throw new Error("Supply at least one named split.");
  if (new Set(splits.map(split => split.name)).size !== splits.length) throw new Error("Use a unique name for each split.");
  const episodes = new Map<string, ContentOccurrence[]>();
  const transitions = new Map<string, ContentOccurrence[]>();
  splits.forEach(({ snapshot }, splitOffset) => {
    snapshot.episodes.forEach((episode, episodeOffset) => {
      const occurrence = { split: splitOffset + 1, episode: episodeOffset + 1 };
      const hash = episodeFingerprint(episode);
      const group = episodes.get(hash) ?? [];
      group.push(occurrence);
      episodes.set(hash, group);
      for (const step of episode.steps) {
        const hash = transitionFingerprint(step);
        const group = transitions.get(hash) ?? [];
        group.push({ ...occurrence, step: step.index });
        transitions.set(hash, group);
      }
    });
  });
  const duplicates: ContaminationReport["duplicates"] = [];
  for (const [kind, groups] of [["episode", episodes], ["transition", transitions]] as const) {
    for (const [sha256, occurrences] of groups) {
      if (occurrences.length < 2) continue;
      const crossSplit = new Set(occurrences.map(item => item.split)).size > 1;
      duplicates.push({ kind, sha256, severity: crossSplit ? "error" : "warning", occurrences });
    }
  }
  return {
    format: "avalon.contamination/v1",
    status: duplicates.some(item => item.severity === "error") ? "fail" : splits.length < 2 ? "inconclusive" : "pass",
    splits: splits.map(({ name, snapshot }, offset) => ({ ordinal: offset + 1, nameHash: contentHash(name), sha256: contentHash(snapshot), episodes: snapshot.episodes.length })),
    duplicates,
    evidence: splits.every(split => split.snapshot.evidence === "synthetic") ? "synthetic" : "user-supplied",
    limits: ["Exact content overlap does not establish a causal leak.", "Different content can share a site, year, or source. This audit cannot exclude that overlap.", "Use site and year boundaries when those keys define independence."],
  };
}
