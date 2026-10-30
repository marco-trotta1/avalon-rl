import { episodeSnapshotSchema, parseSnapshot, type EpisodeSnapshot, type Snapshot } from "../lab/contract.js";
import { challengeCandidates } from "./challenge.js";
import { replayWorld, worldHash, type ReplayReceipt } from "./replay.js";
import { worldTasks, type WorldTask } from "./tasks.js";
import { oracleWorldVerifier, weakWorldVerifier } from "./verifiers.js";

export function worldEpisodeSnapshot(options: {
  id: string; task: WorldTask; receipt: ReplayReceipt;
}): EpisodeSnapshot {
  const { task, receipt } = options;
  const weak = weakWorldVerifier(receipt);
  const oracle = oracleWorldVerifier({ task, receipt });
  return episodeSnapshotSchema.parse({
    id: options.id, task: task.id,
    steps: receipt.transitions.map((transition, index) => ({
      index, observation: transition.observation, action: transition.action,
      reward: transition.nextObservation.claimedDone ? 1 : 0,
      next_observation: transition.nextObservation,
      terminated: transition.terminated, truncated: transition.truncated,
      bootstrap_mask: transition.terminated ? 0 : 1,
    })),
    metadata: {
      evidence: "synthetic", family: task.family, split: task.split,
      weak_accepted: weak.accepted, oracle_accepted: oracle.accepted,
      oracle_reasons: oracle.reasons, replay_stop: receipt.stop,
      initial_hash: receipt.initialHash, final_hash: worldHash(receipt.final),
    },
  });
}
export function makeWorldSnapshot(options: { seed?: number; maxSteps?: number } = {}): Snapshot {
  const tasks = worldTasks(options);
  return parseSnapshot({
    format: "avalon.snapshot/v1", stage: "source", evidence: "synthetic",
    producer: { name: "avalon-operations-world", version: "1" }, seed: tasks[0]!.initial.seed,
    episodes: tasks.flatMap(task => challengeCandidates(task).map(candidate => {
      const receipt = replayWorld({ initial: task.initial, actions: candidate.actions, maxSteps: options.maxSteps });
      return worldEpisodeSnapshot({ id: `${task.id}-${candidate.mutation}`, task, receipt });
    })),
  });
}
