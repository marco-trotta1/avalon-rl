import { parseSnapshot, stepSchema, type Snapshot } from "./contract.js";

export type DemoFault = "reward-shift" | "collapsed-ending" | "none";

export function demoPair({ fault }: { fault: DemoFault }): { source: Snapshot; target: Snapshot } {
  const source = parseSnapshot({
    format: "avalon.snapshot/v1", stage: "source", evidence: "synthetic", seed: 7,
    producer: { name: "avalon-counter", version: "1" },
    episodes: [{ id: "counter-7", task: "reach-counter", metadata: { mission: "Reach two increments." }, steps: [
      { index: 0, observation: { count: 0 }, action: 1, reward: 0, next_observation: { count: 1 }, terminated: false, truncated: false, bootstrap_mask: 1 },
      { index: 1, observation: { count: 1 }, action: 1, reward: 1, next_observation: { count: 2 }, terminated: false, truncated: true, bootstrap_mask: 1 },
    ] }],
  });
  const target = parseSnapshot({ ...structuredClone(source), stage: "learner", producer: { name: "avalon-demo-adapter", version: "1" } });
  const step = target.episodes[0]?.steps[1];
  if (!step) throw new Error("The demonstration requires its final transition.");
  switch (fault) {
    case "none": break;
    case "reward-shift": {
      target.episodes[0]!.steps[1] = stepSchema.parse({ ...step, reward: 2 });
      break;
    }
    case "collapsed-ending": step.terminated = true; step.truncated = false; step.bootstrap_mask = 0; break;
    default: {
      const impossible: never = fault;
      throw new Error(`Unsupported demonstration fault: ${String(impossible)}`);
    }
  }
  return { source, target };
}
