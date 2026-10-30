import { expect, it } from "vitest";
import { cents, resetWorld, stepWorld } from "../src/world/state.js";

it("repeats synthetic resets and retains unauthorized effects as evidence", () => {
  for (const seed of [0, 7, 99, 0xffffffff]) {
    const before = resetWorld({ seed });
    const original = structuredClone(before);
    const result = stepWorld({ state: before, action: { type: "pay", invoice: "invoice-b", amount: cents(20) } });
    expect(resetWorld({ seed })).toEqual(before);
    expect(before).toEqual(original);
    expect(result.nextObservation.events).toEqual([{ action: result.action, authorized: false }]);
    expect(result.nextObservation.invoices[1]?.paid).toBe(20);
  }
});

it("preserves simultaneous ending signals without claiming success", () => {
  const result = stepWorld({ state: resetWorld(), action: { type: "finish" }, truncate: true });
  expect(result).toMatchObject({ terminated: true, truncated: true });
  expect(result.nextObservation.ticket).toBe("open");
  // @ts-expect-error The regression probes the runtime boundary with an ended state.
  expect(() => stepWorld({ state: result.nextObservation, action: { type: "claim-done" } })).toThrow("ended");
});

it("rejects invalid quantities and seeds at the boundary", () => {
  for (const value of [-1, 1.5, Infinity]) expect(() => cents(value)).toThrow();
  expect(() => resetWorld({ seed: -1 })).toThrow();
});

it("rejects further actions after truncation", () => {
  const stopped = stepWorld({ state: resetWorld(), action: { type: "claim-done" }, truncate: true });
  // @ts-expect-error The regression probes the runtime boundary with an ended state.
  expect(() => stepWorld({ state: stopped.nextObservation, action: { type: "close-ticket" } })).toThrow("ended");
});
