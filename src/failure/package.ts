import { z } from "zod";
import { contentHash } from "../audit/engine.js";
import { failureCaseHash, type FailureCase } from "./case.js";
import { replayFailureCase } from "./replay.js";

const reviewSchema = z.strictObject({
  caseHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.string().trim().min(1).max(200),
  reviewedAt: z.iso.datetime({ offset: true }),
  privacyApproved: z.literal(true),
  checksApproved: z.literal(true),
}).brand<"FailureReview">();

export type FailureReview = z.infer<typeof reviewSchema>;
export type FailureUse = "evaluation" | "training" | "redistribution";
export type PackageBlock = "rights-private" | "use-not-permitted" | "review-required"
  | "review-stale" | "sensitive-content" | "failure-unresolved";

export function parseFailureReview(value: unknown): FailureReview {
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success) throw new Error("Supply a complete review for the case hash.");
  return parsed.data;
}

const secretPatterns = [
  /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/i,
];

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return secretPatterns.some(pattern => pattern.test(value));
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => containsSecret(key) || containsSecret(entry));
  }
  return false;
}

export function prepareFailurePackage(options: {
  case: FailureCase; requestedUse: FailureUse; review?: unknown;
}) {
  const failure = options.case;
  const caseHash = failureCaseHash(failure);
  const review = reviewSchema.safeParse(options.review);
  const reasons: PackageBlock[] = [];
  if (failure.rights.status === "private") reasons.push("rights-private");
  else if (!failure.rights.allowedUses.includes(options.requestedUse)) reasons.push("use-not-permitted");
  if (!review.success) reasons.push("review-required");
  else if (review.data.caseHash !== caseHash) reasons.push("review-stale");
  if (containsSecret(failure) || (review.success && containsSecret(review.data))) reasons.push("sensitive-content");
  const replay = replayFailureCase(failure);
  if (replay.status !== "reproducible") reasons.push("failure-unresolved");
  if (reasons.length > 0 || !review.success) return { status: "blocked" as const, reasons };
  const payload = {
    format: "avalon.failure-package.v1" as const,
    caseHash, requestedUse: options.requestedUse,
    review: review.data,
    case: structuredClone(failure),
    replay,
    limits: [
      "Rights and review fields record attestations. They do not authenticate the contributor or reviewer.",
      "The secret scan detects selected patterns. A person must review all content before sharing.",
      "Replay checks recorded snapshots. It does not execute the original environment or establish training value.",
      "This package records no buyer acceptance, payment, license contract, or model improvement.",
    ],
  };
  return { status: "ready" as const, packageHash: contentHash(payload), package: payload };
}
