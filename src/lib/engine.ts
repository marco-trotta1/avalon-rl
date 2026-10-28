import {
  assertNever, environmentSchema, episodeSchema, MAX_FILE_BYTES, MAX_RECORDS,
  MODEL_VERSION, taskSchema,
  type AppraisalCase, type Comparable, type Episode, type Task, type Usd,
} from "./schema.js";

export interface Diagnostic {
  record: number;
  reason: "invalid" | "incomplete" | "duplicate" | "conflicting-id";
}

export interface Analysis {
  kind: "traces" | "environment";
  inputSha256: string;
  inputBytes: number;
  records: number;
  eligibleUnits: number;
  duplicateUnits: number;
  incompleteUnits: number;
  invalidUnits: number;
  conflictingUnits: number;
  steps: number;
  distinctTasks: number;
  terminatedUnits: number;
  truncatedUnits: number;
  declaredTestUnits: number;
  diagnostics: Diagnostic[];
}

type Candidate = {
  record: number;
  id: string;
  fingerprint: string;
  complete: boolean;
} & ({ kind: "traces"; value: Episode } | { kind: "environment"; value: Task });

export interface ComparableDecision {
  record: number;
  id: string;
  included: boolean;
  reason: string;
  unitUsd: Usd;
  date: string;
  evidenceType: Comparable["evidence"]["type"];
}

interface EstimateBase {
  modelVersion: typeof MODEL_VERSION;
  mode: AppraisalCase["evidenceMode"];
  asOfDate: string;
  units: number;
  decisions: ComparableDecision[];
  sampleSize: number;
  warnings: string[];
}

export type Estimate = EstimateBase & (
  | { status: "withheld"; reasons: string[] }
  | {
      status: "estimated";
      lowUsd: Usd;
      medianUsd: Usd;
      highUsd: Usd;
      medianUnitUsd: Usd;
      leaveOneOutMedianErrorPct: number;
    }
);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { return undefined; }
}

export async function analyzeData(input: { text: string; kind: Analysis["kind"] }): Promise<Analysis> {
  const bytes = new TextEncoder().encode(input.text).byteLength;
  if (bytes > MAX_FILE_BYTES) throw new Error("The data file exceeds 10 MiB.");
  if (!input.text.trim()) throw new Error("The data file is empty.");

  let records: unknown[];
  switch (input.kind) {
    case "traces": {
      const lines = input.text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
      if (lines.length > MAX_RECORDS) throw new Error("The file exceeds 20,000 records.");
      records = lines.map(parseJson);
      break;
    }
    case "environment": {
      const result = environmentSchema.safeParse(parseJson(input.text));
      if (!result.success) throw new Error("Use an environment manifest with schemaVersion, environment_id, version, and tasks.");
      records = result.data.tasks;
      break;
    }
    default: return assertNever(input.kind);
  }

  const analysis: Analysis = {
    kind: input.kind, inputSha256: await sha256(input.text), inputBytes: bytes,
    records: records.length, eligibleUnits: 0, duplicateUnits: 0, incompleteUnits: 0,
    invalidUnits: 0, conflictingUnits: 0, steps: 0, distinctTasks: 0,
    terminatedUnits: 0, truncatedUnits: 0, declaredTestUnits: 0, diagnostics: [],
  };
  const candidates: Candidate[] = [];
  const ids = new Map<string, Set<string>>();
  const recordIssue = (diagnostic: Diagnostic) => {
    if (analysis.diagnostics.length < 25) analysis.diagnostics.push(diagnostic);
  };

  for (const [index, value] of records.entries()) {
    let candidate: Candidate;
    if (input.kind === "traces") {
      const result = episodeSchema.safeParse(value);
      if (!result.success) {
        analysis.invalidUnits++;
        recordIssue({ record: index + 1, reason: "invalid" });
        continue;
      }
      const episode = result.data;
      const payload = {
        observations: episode.observations, actions: episode.actions,
        rewards: episode.rewards, terminations: episode.terminations, truncations: episode.truncations,
      };
      candidate = {
        kind: "traces", record: index + 1, id: episode.episode_id, value: episode,
        fingerprint: await sha256(canonical(payload)),
        complete: Boolean(episode.terminations.at(-1) || episode.truncations.at(-1)),
      };
    } else {
      const result = taskSchema.safeParse(value);
      if (!result.success) {
        analysis.invalidUnits++;
        recordIssue({ record: index + 1, reason: "invalid" });
        continue;
      }
      const task = result.data;
      candidate = {
        kind: "environment", record: index + 1, id: task.id, value: task,
        fingerprint: await sha256(canonical({
          instruction: task.instruction, initial_state: task.initial_state,
          reset: task.reset, verifier: task.verifier,
        })),
        complete: Boolean(task.test_receipt && task.test_receipt.passed === task.test_receipt.total),
      };
    }
    candidates.push(candidate);
    const fingerprints = ids.get(candidate.id) ?? new Set<string>();
    fingerprints.add(candidate.fingerprint);
    ids.set(candidate.id, fingerprints);
  }

  const fingerprints = new Set<string>();
  const taskIds = new Set<string>();
  for (const candidate of candidates) {
    if ((ids.get(candidate.id)?.size ?? 0) > 1) {
      analysis.conflictingUnits++;
      recordIssue({ record: candidate.record, reason: "conflicting-id" });
      continue;
    }
    if (!candidate.complete) {
      analysis.incompleteUnits++;
      recordIssue({ record: candidate.record, reason: "incomplete" });
      continue;
    }
    if (fingerprints.has(candidate.fingerprint)) {
      analysis.duplicateUnits++;
      recordIssue({ record: candidate.record, reason: "duplicate" });
      continue;
    }
    fingerprints.add(candidate.fingerprint);
    analysis.eligibleUnits++;
    switch (candidate.kind) {
      case "traces": {
        analysis.steps += candidate.value.actions.length;
        taskIds.add(candidate.value.task_id);
        if (candidate.value.terminations.at(-1)) analysis.terminatedUnits++;
        if (candidate.value.truncations.at(-1)) analysis.truncatedUnits++;
        break;
      }
      case "environment": {
        analysis.declaredTestUnits++;
        taskIds.add(candidate.id);
        break;
      }
      default: assertNever(candidate);
    }
  }
  analysis.distinctTasks = taskIds.size;
  return analysis;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) throw new Error("The median requires evidence.");
  return sorted.length % 2 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

export function estimateValue(input: { appraisal: AppraisalCase; analysis: Analysis }): Estimate {
  const { appraisal, analysis } = input;
  const decisions: ComparableDecision[] = [];
  const unitPrices: number[] = [];
  const counterparties = new Set<string>();
  const documents = new Set<string>();
  const dealIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const reasons: string[] = [];
  const warnings = [
    "The observed deal range is a sensitivity range. It is not a confidence interval.",
    "The ledger author attests to document review. The script does not verify contracts, rights, or independence.",
    "The model assumes a linear price per eligible unit. Negotiated bundle discounts can change the price.",
    "Training utility and semantic novelty are not measured. No quality premium is added.",
  ];
  for (const deal of appraisal.comparables) {
    if (dealIds.has(deal.id)) duplicateIds.add(deal.id);
    dealIds.add(deal.id);
  }

  const asOf = Date.parse(`${appraisal.asOfDate}T00:00:00Z`);
  const deals = appraisal.comparables.map((deal, index) => ({ deal, record: index + 1 }))
    .sort(({ deal: a }, { deal: b }) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  for (const { deal, record } of deals) {
    const ageDays = (asOf - Date.parse(`${deal.date}T00:00:00Z`)) / 86_400_000;
    const volumeRatio = analysis.eligibleUnits / deal.units;
    let reason = "Included: matching, reviewed transaction.";
    let included = true;
    const exclude = (message: string) => { included = false; reason = message; };
    if (duplicateIds.has(deal.id)) exclude("Duplicate deal identifier.");
    else if (deal.kind !== appraisal.asset.kind || deal.domain !== appraisal.asset.domain ||
             deal.modality !== appraisal.asset.modality || deal.use !== appraisal.asset.use) exclude("The asset scope differs.");
    else if (canonical(deal.rights) !== canonical(appraisal.asset.rights)) exclude("The rights or license term differs.");
    else if (deal.evidence.type !== "closed-contract" && deal.evidence.type !== "paid-invoice") exclude("A quote or asking price is not a completed transaction.");
    else if (ageDays < 0 || ageDays > 365) exclude("The deal is outside the 365-day window.");
    else if (deal.evidence.reviewedOn > appraisal.asOfDate || deal.evidence.reviewedOn < deal.date) exclude("The review date does not support this appraisal date.");
    else if (volumeRatio < 0.25 || volumeRatio > 4) exclude("The unit count differs by more than 4 times.");
    else if (documents.has(deal.evidence.documentSha256)) exclude("The source document is already included.");
    else if (counterparties.has(deal.counterpartyGroup.toLowerCase())) exclude("The counterparty group is already included.");

    const unitUsd = (deal.totalUsd / deal.units) as Usd;
    decisions.push({ record, id: deal.id, included, reason, unitUsd, date: deal.date, evidenceType: deal.evidence.type });
    if (included) {
      counterparties.add(deal.counterpartyGroup.toLowerCase());
      documents.add(deal.evidence.documentSha256);
      unitPrices.push(unitUsd);
    }
  }
  if (analysis.kind !== appraisal.asset.kind) reasons.push("The data type does not match the appraisal asset.");
  if (!analysis.eligibleUnits) reasons.push("The analyzer found no eligible units.");
  if (appraisal.asset.provenance.status !== "documented") reasons.push("Document the data provenance.");
  if (appraisal.asset.transferRights.status !== "documented") reasons.push("Document the rights for this license or sale.");
  if (unitPrices.length < 3) reasons.push(`Supply at least 3 matching transactions from distinct counterparty groups. Current count: ${unitPrices.length}.`);
  if (analysis.kind === "environment") warnings.push("The analyzer inspects task specifications and declared test receipts. It does not execute the environment.");
  if (appraisal.evidenceMode === "synthetic") warnings.unshift("Synthetic demonstration. These prices do not describe the market.");
  const base: EstimateBase = {
    modelVersion: MODEL_VERSION, mode: appraisal.evidenceMode, asOfDate: appraisal.asOfDate,
    units: analysis.eligibleUnits, decisions, sampleSize: unitPrices.length, warnings,
  };
  if (reasons.length) return { ...base, status: "withheld", reasons };
  const unitMedian = median(unitPrices);
  const errors = unitPrices.map((price, index) => {
    const predicted = median(unitPrices.filter((_, position) => position !== index));
    return 100 * Math.abs(predicted - price) / price;
  });
  return {
    ...base, status: "estimated",
    lowUsd: (Math.min(...unitPrices) * analysis.eligibleUnits) as Usd,
    medianUsd: (unitMedian * analysis.eligibleUnits) as Usd,
    highUsd: (Math.max(...unitPrices) * analysis.eligibleUnits) as Usd,
    medianUnitUsd: unitMedian as Usd,
    leaveOneOutMedianErrorPct: median(errors),
  };
}

export function aggregateReport(input: { appraisal: AppraisalCase; analysis: Analysis; estimate: Estimate }): object {
  const { appraisal, analysis, estimate } = input;
  const { diagnostics: _diagnostics, ...counts } = analysis;
  const { decisions: _decisions, ...summary } = estimate;
  return {
    format: "avalon-rl-aggregate-v1",
    sensitivity: "Private. This report contains aggregate counts, terms, and prices.",
    scope: {
      kind: appraisal.asset.kind, modality: appraisal.asset.modality,
      rights: appraisal.asset.rights, use: appraisal.asset.use,
    },
    analysis: counts,
    estimate: summary,
    comparableDecisions: estimate.decisions.map(({ id: _id, ...decision }) => decision),
    method: "Median price per eligible unit from matching, author-attested transactions. Observed minimum and maximum define the range.",
    policy: { maximumDealAgeDays: 365, minimumTransactions: 3, minimumVolumeRatio: 0.25, maximumVolumeRatio: 4 },
  };
}
