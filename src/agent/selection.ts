import { z } from "zod";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const score = z.number().finite().min(-1e12).max(1e12);
const milliseconds = z.number().finite().nonnegative().brand<"Milliseconds">();
const usd = z.number().finite().nonnegative().brand<"Usd">();
const candidateIdentity = { id: identifier, artifactSha256: sha256 };

const planSchema = z.strictObject({
  format: z.literal("avalon-selection-plan-v1"), baselineId: identifier,
  metric: z.strictObject({
    name: z.string().trim().min(1).max(120), lower: score, upper: score,
    direction: z.enum(["maximize", "minimize"]),
  }),
  delta: z.number().finite().gt(0).lt(1), minImprovement: z.number().finite().nonnegative().max(1e12),
  sampling: z.strictObject({
    unit: z.string().trim().min(1).max(120),
    assumption: z.enum(["independent", "uniform-without-replacement"]),
    seed: z.number().int().min(0).max(0xffffffff),
    sampleIds: z.array(identifier).min(2).max(100_000),
  }),
  candidates: z.array(z.strictObject(candidateIdentity)).min(2).max(32),
}).superRefine((plan, context) => {
  if (!(plan.metric.lower < plan.metric.upper)) context.addIssue({ code: "custom", message: "Declare increasing score bounds." });
  const ids = plan.candidates.map(candidate => candidate.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Declare each candidate once." });
  if (!ids.includes(plan.baselineId)) context.addIssue({ code: "custom", message: "Include the named baseline in the roster." });
  if (new Set(plan.sampling.sampleIds).size !== plan.sampling.sampleIds.length) {
    context.addIssue({ code: "custom", message: "Declare each evaluation unit once." });
  }
});

const measurements = {
  latencyMs: milliseconds,
  cost: z.strictObject({ externalApiUsd: usd, computeUsd: usd.nullable(), hostAgentUsd: usd.nullable() }),
};
const scoresSchema = z.strictObject({
  format: z.literal("avalon-selection-scores-v1"), planSha256: sha256,
  candidates: z.array(z.discriminatedUnion("status", [
    z.strictObject({
      ...candidateIdentity, status: z.literal("complete"),
      samples: z.array(z.strictObject({ sampleId: identifier, value: score })).min(2).max(100_000),
      ...measurements,
    }),
    z.strictObject({ ...candidateIdentity, status: z.literal("failed"), reason: z.string().trim().min(1).max(2000), ...measurements }),
  ])).min(2).max(32),
});

export type SelectionPlan = z.infer<typeof planSchema>;
type SelectionScores = z.infer<typeof scoresSchema>;
const validated = Symbol("validated selection input");
export type SelectionInput = {
  readonly plan: SelectionPlan; readonly scores: SelectionScores; readonly planSha256: string;
  readonly [validated]: true;
};

export function parseSelectionPlan(value: unknown): SelectionPlan {
  const result = planSchema.safeParse(value);
  if (!result.success) throw new Error("Use the documented selection plan, known bounds, and a fixed candidate roster.");
  return result.data;
}

export function parseSelection(input: { plan: unknown; scores: unknown; planSha256: string }): SelectionInput {
  const plan = parseSelectionPlan(input.plan);
  const result = scoresSchema.safeParse(input.scores);
  if (!result.success) throw new Error("Use the documented selection scores, finite measurements, and candidate statuses.");
  const scores = result.data;
  if (!sha256.safeParse(input.planSha256).success || scores.planSha256 !== input.planSha256) {
    throw new Error("The scores must bind the exact selection plan bytes.");
  }
  const roster = new Map(plan.candidates.map(candidate => [candidate.id, candidate.artifactSha256]));
  const received = new Set<string>();
  const sampleIds = new Set(plan.sampling.sampleIds);
  for (const candidate of scores.candidates) {
    if (received.has(candidate.id) || roster.get(candidate.id) !== candidate.artifactSha256) {
      throw new Error("The score roster or candidate artifact differs from the selection plan.");
    }
    received.add(candidate.id);
    if (candidate.status === "failed") continue;
    const samples = new Set<string>();
    for (const sample of candidate.samples) {
      if (!sampleIds.has(sample.sampleId) || samples.has(sample.sampleId)) {
        throw new Error("Score each declared evaluation unit exactly once per candidate.");
      }
      if (sample.value < plan.metric.lower || sample.value > plan.metric.upper) {
        throw new Error("A score exceeds the declared bounds. Preserve the failure and revise the experiment.");
      }
      samples.add(sample.sampleId);
    }
    if (samples.size !== sampleIds.size) throw new Error("Complete the fixed evaluation budget before selection.");
  }
  if (received.size !== roster.size) throw new Error("Record every planned candidate, including each failed candidate.");
  return { plan, scores, planSha256: input.planSha256, [validated]: true };
}

type CompleteSummary = {
  id: string; artifactSha256: string; status: "complete"; sampleCount: number;
  mean: number; radius: number; interval: { lower: number; upper: number };
  normalized: { mean: number; interval: { lower: number; upper: number } };
  latencyMs: z.infer<typeof milliseconds>; cost: z.infer<typeof scoresSchema>["candidates"][number]["cost"];
};
type CandidateSummary = CompleteSummary | Extract<SelectionScores["candidates"][number], { status: "failed" }>;
type Decision =
  | { status: "selected"; candidateId: string; reason: "separated-bounds" }
  | { status: "inconclusive"; reason: "candidate-failed" | "overlapping-bounds" | "baseline-margin" };

export function selectCandidates(input: SelectionInput) {
  const { plan, scores } = input;
  const sampleCount = plan.sampling.sampleIds.length;
  const width = plan.metric.upper - plan.metric.lower;
  const normalizedRadius = Math.sqrt((Math.log(2 * plan.candidates.length) - Math.log(plan.delta)) / (2 * sampleCount));
  const radius = width * normalizedRadius;
  const metricValue = (normalized: number) => Math.max(plan.metric.lower, Math.min(plan.metric.upper,
    plan.metric.lower * (1 - normalized) + plan.metric.upper * normalized));
  const orderedScores = new Map(scores.candidates.map(candidate => [candidate.id, candidate]));
  const candidates: CandidateSummary[] = plan.candidates.map(candidate => {
    const measured = orderedScores.get(candidate.id);
    if (measured === undefined) throw new Error("The validated candidate roster is incomplete.");
    if (measured.status === "failed") return measured;
    const normalizedMean = Math.max(0, Math.min(1, measured.samples.toSorted((left, right) => left.sampleId.localeCompare(right.sampleId))
      .reduce((sum, sample) => sum + (sample.value - plan.metric.lower) / width, 0) / sampleCount));
    const normalizedInterval = { lower: Math.max(0, normalizedMean - normalizedRadius), upper: Math.min(1, normalizedMean + normalizedRadius) };
    return {
      id: measured.id, artifactSha256: measured.artifactSha256, status: "complete", sampleCount, mean: metricValue(normalizedMean), radius,
      interval: { lower: metricValue(normalizedInterval.lower), upper: metricValue(normalizedInterval.upper) },
      normalized: { mean: normalizedMean, interval: normalizedInterval },
      latencyMs: measured.latencyMs, cost: measured.cost,
    };
  });
  const completed = candidates.filter((candidate): candidate is CompleteSummary => candidate.status === "complete");
  const maximize = plan.metric.direction === "maximize";
  completed.sort((left, right) => (maximize ? right.normalized.mean - left.normalized.mean : left.normalized.mean - right.normalized.mean) || left.id.localeCompare(right.id));
  const leader = completed[0];
  const empiricalLeaders = leader === undefined ? [] : completed.filter(candidate => Math.abs(candidate.normalized.mean - leader.normalized.mean) <= Number.EPSILON * 8);
  let decision: Decision = { status: "inconclusive", reason: "overlapping-bounds" };
  if (completed.length !== candidates.length) decision = { status: "inconclusive", reason: "candidate-failed" };
  else if (leader !== undefined) {
    const separated = completed.every(other => other.id === leader.id || (maximize
      ? leader.normalized.interval.lower > other.normalized.interval.upper : leader.normalized.interval.upper < other.normalized.interval.lower));
    const baseline = completed.find(candidate => candidate.id === plan.baselineId);
    if (baseline === undefined) throw new Error("The validated baseline is missing.");
    const margin = leader.id === baseline.id || (maximize
      ? leader.normalized.interval.lower - baseline.normalized.interval.upper > plan.minImprovement / width
      : baseline.normalized.interval.lower - leader.normalized.interval.upper > plan.minImprovement / width);
    if (separated && margin) decision = { status: "selected", candidateId: leader.id, reason: "separated-bounds" };
    else if (separated) decision = { status: "inconclusive", reason: "baseline-margin" };
  }
  return {
    format: "avalon-selection-report-v1" as const, planSha256: input.planSha256,
    decision, empiricalLeaders: empiricalLeaders.map(candidate => candidate.id),
    simpleBaseline: { method: "empirical-mean" as const, candidateIds: empiricalLeaders.map(candidate => candidate.id) },
    baselineId: plan.baselineId, metric: plan.metric, candidates,
    confidence: {
      method: "hoeffding-union-bound" as const, delta: plan.delta, candidateCount: candidates.length, sampleCount,
      inspection: "one fixed final look" as const, sampling: plan.sampling, assumptionStatus: "declared, not verified" as const,
      arithmetic: "normalized score coordinates" as const, normalizedRadius,
      radiusFormula: "(upper-lower)*sqrt(log(2*K/delta)/(2*n))",
    },
    limits: [
      "Freeze the roster, artifacts, score bounds, evaluation units, and sample count before viewing the evaluation scores.",
      "Independent samples or uniform sampling without replacement must match the declared evaluation population.",
      "Shared evaluation units can correlate candidates. Agent votes and repeated steps do not supply independent evaluation units.",
      "This bound covers one fixed inspection. Repeated inspection or adaptive candidate changes require a different error allocation.",
      "Hashes bind supplied bytes. They do not prove execution, independence, blind evaluation, or population score bounds.",
      "The selected candidate still requires a separate final evaluation. Unknown compute and agent costs remain unpriced.",
    ],
  };
}
