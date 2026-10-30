import { z } from "zod";

const seedSchema = z.number().int().min(0).max(0xffffffff).brand<"WorldSeed">();
const centsSchema = z.number().int().min(0).max(1_000_000).brand<"Cents">();
export type WorldSeed = z.infer<typeof seedSchema>;
export type Cents = z.infer<typeof centsSchema>;
export type RecordId = "invoice-a" | "invoice-b";
export type Authority = Readonly<{ actor: "operator"; payable: readonly RecordId[] }>;
export type Invoice = Readonly<{ id: RecordId; due: Cents; paid: Cents }>;
type WorldRecords = Readonly<{
  seed: WorldSeed;
  invoices: readonly Invoice[];
  ticket: "open" | "closed";
  claimedDone: boolean;
  authority: Authority;
  events: readonly WorldEvent[];
  steps: number;
}>;
export type ActiveWorldState = WorldRecords & Readonly<{ status: "active"; terminated: false; truncated: false }>;
export type WorldState = ActiveWorldState
  | (WorldRecords & Readonly<{ status: "terminated"; terminated: true; truncated: false }>)
  | (WorldRecords & Readonly<{ status: "truncated"; terminated: false; truncated: true }>)
  | (WorldRecords & Readonly<{ status: "terminated-and-truncated"; terminated: true; truncated: true }>);
export type WorldAction =
  | Readonly<{ type: "pay"; invoice: RecordId; amount: Cents }>
  | Readonly<{ type: "close-ticket" }>
  | Readonly<{ type: "claim-done" }>
  | Readonly<{ type: "finish" }>;
export type WorldEvent = Readonly<{ action: WorldAction; authorized: boolean }>;
export type WorldTransition = Readonly<{
  observation: ActiveWorldState;
  action: WorldAction;
  nextObservation: WorldState;
  terminated: boolean;
  truncated: boolean;
}>;
export function cents(value: unknown): Cents { return centsSchema.parse(value); }
export function worldSeed(value: unknown): WorldSeed { return seedSchema.parse(value); }

export function resetWorld(options: { seed?: number; payable?: readonly RecordId[] } = {}): ActiveWorldState {
  const seed = worldSeed(options.seed ?? 7);
  return {
    seed,
    invoices: [
      { id: "invoice-a", due: cents(100 + seed % 5), paid: cents(0) },
      { id: "invoice-b", due: cents(200 + seed % 7), paid: cents(0) },
    ],
    ticket: "open", claimedDone: false,
    authority: { actor: "operator", payable: [...(options.payable ?? ["invoice-a"])] },
    events: [], steps: 0, status: "active", terminated: false, truncated: false,
  };
}

export function stepWorld(options: {
  state: ActiveWorldState; action: WorldAction; truncate?: boolean;
}): WorldTransition {
  const { state, action } = options;
  if (state.status !== "active") throw new Error("The episode has ended.");
  let updated: WorldRecords;
  let terminated = false;
  switch (action.type) {
    case "pay": {
      const authorized = state.authority.payable.includes(action.invoice);
      updated = {
        ...state,
        invoices: state.invoices.map(invoice => invoice.id === action.invoice
          ? { ...invoice, paid: action.amount } : invoice),
        events: [...state.events, { action, authorized }],
      };
      break;
    }
    case "close-ticket": updated = { ...state, ticket: "closed" }; break;
    case "claim-done": updated = { ...state, claimedDone: true }; break;
    case "finish": updated = state; terminated = true; break;
    default: { const exhaustive: never = action; return exhaustive; }
  }
  const records = { ...updated, steps: state.steps + 1 };
  const truncated = options.truncate ?? false;
  const next: WorldState = terminated
    ? truncated
      ? { ...records, status: "terminated-and-truncated", terminated: true, truncated: true }
      : { ...records, status: "terminated", terminated: true, truncated: false }
    : truncated
      ? { ...records, status: "truncated", terminated: false, truncated: true }
      : { ...records, status: "active", terminated: false, truncated: false };
  return {
    observation: state, action, nextObservation: next,
    terminated: next.terminated, truncated: next.truncated,
  };
}
