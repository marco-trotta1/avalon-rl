import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import type { Snapshot } from "../lab/contract.js";
import { auditTraceContract, type TraceAudit, type TraceCheck } from "./audit.js";
import type { TraceContract } from "./contract.js";

const checkIndexSchema = z.number().int().nonnegative().brand<"TraceCheckIndex">();
export type TraceWitness = Readonly<{
  format: "avalon.trace-witness/v1"; private: true;
  source: Readonly<{ snapshotHash: string; contractHash: string; finding: z.infer<typeof checkIndexSchema> }>;
  selection: TraceCheck; bindingHash: string; snapshot: Snapshot; contract: TraceContract; audit: TraceAudit;
  reduction: Readonly<{ episodesBefore: number; episodesAfter: 1; rulesBefore: number; rulesAfter: 1; stepMinimal: false }>;
  limits: readonly string[];
}>;
function findingHash(check: TraceCheck): string {
  return contentHash({ episodeHash: check.episodeHash, ruleId: check.ruleId, status: check.status, code: check.code,
    step: check.step ?? null, expectedHash: check.expectedHash ?? null, actualHash: check.actualHash ?? null });
}

export function buildTraceWitness(options: { snapshot: Snapshot; contract: TraceContract; finding?: number }): TraceWitness {
  const sourceAudit = auditTraceContract(options);
  const index = checkIndexSchema.safeParse(options.finding ?? sourceAudit.checks.findIndex(check => check.status === "mismatch"));
  const selected = index.success ? sourceAudit.checks[index.data] : undefined;
  if (!index.success || !selected || selected.status !== "mismatch") {
    throw new Error("Select a mismatching check from the trace audit.");
  }
  const episode = options.snapshot.episodes[selected.episode - 1]!;
  const rule = options.contract.rules.find(item => item.id === selected.ruleId)!;
  const snapshot: Snapshot = { ...options.snapshot, episodes: [structuredClone(episode)] };
  const contract: TraceContract = { ...options.contract, rules: [structuredClone(rule)] };
  const audit = auditTraceContract({ snapshot, contract });
  const bindingHash = findingHash(selected);
  if (!audit.checks[0] || findingHash(audit.checks[0]) !== bindingHash) {
    throw new Error("The selected trace finding does not survive evidence reduction.");
  }
  return {
    format: "avalon.trace-witness/v1", private: true,
    source: { snapshotHash: sourceAudit.snapshotHash, contractHash: sourceAudit.contractHash, finding: index.data },
    selection: { ...selected }, bindingHash, snapshot, contract, audit,
    reduction: { episodesBefore: options.snapshot.episodes.length, episodesAfter: 1,
      rulesBefore: options.contract.rules.length, rulesAfter: 1, stepMinimal: false },
    limits: ["The witness contains raw selected evidence. Keep the output private.",
      "The reduction isolates one complete episode and rule. It does not find a shortest action sequence.",
      "Hashes bind supplied artifacts. They do not authenticate the original recorder."],
  };
}

export function verifyTraceWitness(options: { witness: TraceWitness; sourceSnapshot: Snapshot; sourceContract: TraceContract }): boolean {
  const { witness, sourceSnapshot, sourceContract } = options;
  if (contentHash(sourceSnapshot) !== witness.source.snapshotHash || contentHash(sourceContract) !== witness.source.contractHash
    || witness.snapshot.episodes.length !== 1 || witness.contract.rules.length !== 1) return false;
  const source = auditTraceContract({ snapshot: sourceSnapshot, contract: sourceContract });
  const selected = source.checks[witness.source.finding];
  if (!selected || selected.status !== "mismatch" || findingHash(selected) !== witness.bindingHash
    || contentHash(selected) !== contentHash(witness.selection)) return false;
  const episode = sourceSnapshot.episodes[selected.episode - 1];
  const rule = sourceContract.rules.find(item => item.id === selected.ruleId);
  if (!episode || !rule
    || contentHash({ ...sourceSnapshot, episodes: [episode] }) !== contentHash(witness.snapshot)
    || contentHash({ ...sourceContract, rules: [rule] }) !== contentHash(witness.contract)) return false;
  const reduced = auditTraceContract({ snapshot: witness.snapshot, contract: witness.contract });
  return reduced.checks.length === 1 && findingHash(reduced.checks[0]!) === witness.bindingHash
    && contentHash(reduced) === contentHash(witness.audit);
}
