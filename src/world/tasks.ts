import { resetWorld, type Cents, type RecordId, type WorldAction, type WorldState, type ActiveWorldState } from "./state.js";

export type WorldTask = Readonly<{
  id: "settle-a" | "settle-b" | "close-ticket" | "settle-and-close";
  family: "invoice-settlement" | "ticket-resolution";
  split: "train" | "eval";
  difficulty: 1 | 2;
  initial: ActiveWorldState;
  goal: Readonly<{
    payment: Readonly<{ invoice: RecordId; amount: Cents }> | null;
    ticket: "open" | "closed";
  }>;
  knownGood: readonly WorldAction[];
}>;

export function worldTasks(options: { seed?: number } = {}): readonly WorldTask[] {
  const initial = resetWorld(options);
  const invoiceA = initial.invoices[0];
  const invoiceB = initial.invoices[1];
  if (!invoiceA || !invoiceB) throw new Error("The world requires both fixture invoices.");
  const payA = { type: "pay", invoice: "invoice-a", amount: invoiceA.due } as const;
  const finish = { type: "finish" } as const;
  return [
    {
      id: "settle-a", family: "invoice-settlement", split: "train", difficulty: 1, initial,
      goal: { payment: { invoice: "invoice-a", amount: invoiceA.due }, ticket: "open" },
      knownGood: [payA, finish],
    },
    {
      id: "settle-b", family: "invoice-settlement", split: "train", difficulty: 1,
      initial: resetWorld({ ...options, payable: ["invoice-b"] }),
      goal: { payment: { invoice: "invoice-b", amount: invoiceB.due }, ticket: "open" },
      knownGood: [{ type: "pay", invoice: "invoice-b", amount: invoiceB.due }, finish],
    },
    {
      id: "close-ticket", family: "ticket-resolution", split: "eval", difficulty: 1, initial,
      goal: { payment: null, ticket: "closed" },
      knownGood: [{ type: "close-ticket" }, finish],
    },
    {
      id: "settle-and-close", family: "ticket-resolution", split: "eval", difficulty: 2, initial,
      goal: { payment: { invoice: "invoice-a", amount: invoiceA.due }, ticket: "closed" },
      knownGood: [payA, { type: "close-ticket" }, finish],
    },
  ];
}

export type OutcomeEvidence = Readonly<{
  payment: boolean; ticket: boolean; protectedInvoices: boolean; authority: boolean;
}>;
export function taskEvidence(options: { task: WorldTask; state: WorldState }): OutcomeEvidence {
  const { task, state } = options;
  const payment = task.goal.payment;
  return {
    payment: payment === null || state.invoices.some(invoice => invoice.id === payment.invoice && invoice.paid === payment.amount),
    ticket: state.ticket === task.goal.ticket,
    protectedInvoices: task.initial.invoices.filter(invoice => invoice.id !== payment?.invoice)
      .every(before => state.invoices.some(after => after.id === before.id && after.paid === before.paid && after.due === before.due)),
    authority: state.events.every(event => event.authorized),
  };
}
