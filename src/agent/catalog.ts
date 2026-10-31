export const COMMAND_NAMES = [
  "avalon", "rl-research", "rl-spec", "rl-env", "rl-scenarios", "rl-reward", "rl-break", "rl-harden",
  "rl-data", "rl-probs", "rl-credit", "rl-train", "rl-diagnose", "rl-ablate", "rl-curriculum", "rl-eval",
  "rl-transfer", "rl-optimize", "rl-reproduce", "rl-release",
] as const;

export type AgentCommandName = typeof COMMAND_NAMES[number];

const descriptions: Record<AgentCommandName, string> = {
  avalon: "Coordinate an evidence-based RL workflow.",
  "rl-research": "Find a testable research opportunity.",
  "rl-spec": "Define the task and experiment.",
  "rl-env": "Build and exercise an environment.",
  "rl-scenarios": "Generate structured task coverage.",
  "rl-reward": "Build and test the grader.",
  "rl-break": "Find replayable rewarded failures.",
  "rl-harden": "Repair a demonstrated grading failure.",
  "rl-data": "Inspect the learner's experience.",
  "rl-probs": "Inspect generation and training probabilities.",
  "rl-credit": "Inspect assignment of learning credit.",
  "rl-train": "Run a bounded training experiment.",
  "rl-diagnose": "Investigate a failing or misleading run.",
  "rl-ablate": "Compare controlled experiment conditions.",
  "rl-curriculum": "Test a practice schedule.",
  "rl-eval": "Evaluate a frozen candidate.",
  "rl-transfer": "Test declared distribution shifts.",
  "rl-optimize": "Improve a measured resource constraint.",
  "rl-reproduce": "Rerun a recorded result.",
  "rl-release": "Deliver a verified RL artifact.",
};

export const AGENT_COMMANDS = COMMAND_NAMES.map(name => ({ name, invocation: `/${name}`, description: descriptions[name] }));

export function parseCommandName(value: string): AgentCommandName {
  const name = value.startsWith("/") ? value.slice(1) : value;
  const command = COMMAND_NAMES.find(candidate => candidate === name);
  if (command === undefined) throw new Error("Select a command from avalon agent commands.");
  return command;
}
