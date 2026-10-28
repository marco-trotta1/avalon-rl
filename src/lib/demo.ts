import { parseCase, type AppraisalCase, type Episode } from "./schema.js";

export function demoCase(kind: "traces" | "environment"): AppraisalCase {
  const prices = kind === "traces" ? [42, 55, 62.5, 75, 91] : [650, 850, 1100, 1400, 1600];
  const units = kind === "traces" ? 240 : 12;
  const common = {
    kind, domain: "software-operations", modality: "tool-use", use: "training-and-evaluation",
    rights: { type: "nonexclusive", termMonths: 12 },
  };
  return parseCase(JSON.stringify({
    schemaVersion: 1, evidenceMode: "synthetic", asOfDate: "2026-10-27",
    asset: {
      ...common, name: kind === "traces" ? "Software operations traces" : "Software operations environment",
      provenance: { status: "documented", reference: "Synthetic provenance example. No real data." },
      transferRights: { status: "documented", reference: "Synthetic rights example. No real contract." },
    },
    comparables: prices.map((price, index) => ({
      ...common, id: `Synthetic deal ${index + 1}`, currency: "USD", units,
      totalUsd: price * units, date: `2026-10-${String(10 + index).padStart(2, "0")}`,
      counterpartyGroup: `Synthetic buyer ${index + 1}`,
      evidence: {
        type: index % 2 ? "paid-invoice" : "closed-contract",
        reference: "Invented transaction for script testing.",
        documentSha256: String(index + 1).repeat(64),
        reviewer: "Synthetic reviewer", reviewedOn: "2026-10-20",
      },
    })),
  }));
}

export function syntheticEpisode(index: number): Episode {
  return {
    episode_id: `synthetic-${index}`, task_id: `task-${index % 8}`,
    observations: [{ syntheticState: index, step: 0 }, { syntheticState: index, step: 1 }, { syntheticState: index, step: 2 }],
    actions: [{ tool: "read", key: index }, { tool: "update", key: index }],
    rewards: [0, index % 5 ? 1 : 0], terminations: [false, index % 7 !== 0], truncations: [false, index % 7 === 0],
  };
}

export function demoData(kind: "traces" | "environment"): string {
  if (kind === "environment") {
    return JSON.stringify({
      schemaVersion: 1, environment_id: "synthetic-operations", version: "1.0.0",
      tasks: Array.from({ length: 12 }, (_, index) => ({
        id: `task-${index}`, instruction: `Update synthetic ticket ${index} and verify the result.`,
        initial_state: { ticket: index, status: "open" }, reset: "Restore the declared initial state.",
        verifier: { type: "programmatic", definition: `ticket[${index}].status === 'resolved'` },
        test_receipt: { passed: 10, total: 10, documentSha256: "a".repeat(64) },
      })),
    }, null, 2);
  }
  const episodes = Array.from({ length: 240 }, (_, index) => JSON.stringify(syntheticEpisode(index)));
  const duplicates = Array.from({ length: 12 }, (_, index) => JSON.stringify({ ...syntheticEpisode(index), episode_id: `copy-${index}` }));
  const incomplete = Array.from({ length: 6 }, (_, index) => JSON.stringify({
    ...syntheticEpisode(300 + index), terminations: [false, false], truncations: [false, false],
  }));
  return [...episodes, ...duplicates, ...incomplete, '{"invalid":true}', "invalid-json"].join("\n");
}

export function blankCase(kind: "traces" | "environment"): string {
  const today = new Date();
  const asOfDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return JSON.stringify({
    schemaVersion: 1, evidenceMode: "user-supplied", asOfDate,
    asset: {
      name: "Private asset", kind, domain: "replace-with-your-domain", modality: "tool-use",
      use: "training-and-evaluation", rights: { type: "nonexclusive", termMonths: 12 },
      provenance: { status: "unknown" }, transferRights: { status: "unknown" },
    },
    comparables: [],
  }, null, 2);
}
