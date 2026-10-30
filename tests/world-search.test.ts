import { expect, it } from "vitest";
import { searchWorldCounterexamples } from "../src/world/search.js";

it("enumerates only the declared finite alphabet and depth", () => {
  const report = searchWorldCounterexamples({ maxDepth: 2, budget: 1000 });
  expect(report).toMatchObject({ declaredCandidates: 144, evaluated: 144, unexplored: 0, exhaustiveWithinDeclaredSpace: true });
  expect(report.falseAccepts).toBeGreaterThan(0);
  expect(report.falseRejects).toBeGreaterThan(0);
  for (const item of report.cases) {
    expect(item.actions.length).toBeLessThanOrEqual(2);
    expect(item.actions.slice(0, -1).some(action => action.type === "finish")).toBe(false);
  }
});

it("enforces the budget and reports unsearched candidates", () => {
  const report = searchWorldCounterexamples({ budget: 9, maxDepth: 3 });
  expect(report).toMatchObject({ evaluated: 9, declaredCandidates: 744, unexplored: 735, exhaustiveWithinDeclaredSpace: false });
  expect(report.taskCoverage.map(item => item.evaluated)).toEqual([3, 2, 2, 2]);
  expect(searchWorldCounterexamples({ budget: 9, maxDepth: 3 })).toEqual(report);
});

it("rejects unbounded search requests", () => {
  expect(() => searchWorldCounterexamples({ maxDepth: 5 })).toThrow();
  expect(() => searchWorldCounterexamples({ budget: 0 })).toThrow();
});
