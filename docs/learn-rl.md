# Learn RL through Avalon

Build the CLI before you start.
Each experiment uses synthetic data and local compute.

## 1. Follow one interaction

An environment contains a state.
An observation exposes part of that state to an agent.
A policy selects an action from the available information.
The environment then emits a new observation, a reward, and episode ending signals.
A trajectory records a sequence of these interactions.

```sh
node dist/cli.js world-run --data examples/world/claim-plan.json
```

Inspect the actions, final state, weak verdict, and oracle verdict.
The completion claim receives a reward even though the requested payment does not occur.
The world uses local records. It never transfers money.

The lesson is concrete: a reward can describe the grader instead of the intended outcome.

## 2. Separate an ending from success

```sh
node dist/cli.js lab-demo --fault collapsed-ending
```

Termination means the task reaches a terminal state.
Truncation means an external condition stops the episode.
Success and failure can both terminate an episode.
A time limit can truncate an episode before its task ends.

A value function estimates future return.
A simple temporal-difference target is:

```text
target = reward + discount * bootstrap_mask * next_value
```

Under Avalon's declared continuing-task convention, the mask is zero on termination.
It remains one on truncation without termination.
Collapsing both signals into one field can therefore change the target.
Task semantics still matter. A finite-horizon task can terminate at its intrinsic horizon.
The [Gymnasium guide](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/) explains this distinction.

## 3. Watch experience cross a real boundary

Follow the Python setup in the main README.
Run the `experiment` command and inspect its three snapshots.

| Stage | Question |
| --- | --- |
| Source | What does the environment emit? |
| Recorded | What survives Minari save and load? |
| Learner | What do the NumPy update and bootstrap mask receive? |

The experiment performs actual tabular TD updates.
It does not train a language model or establish a policy improvement.
A stored episode contains a final observation before reset.
A reset observation belongs to a different episode.
Replacing one with the other changes the learning problem.

## 4. Challenge the diagnosis

Run the `compare` command from the README.
It compares a structural check, an exact assertion, and Avalon on the same inputs.
The selected faults include dropped transitions, shifted rewards, reset observations, collapsed flags, and stale context.
The exact assertion matches Avalon on this fixture set.
Avalon also records where the values change and can retain a reproducing witness.
Neither result proves that a native upstream converter has a defect.

## 5. Treat the reward as software

```sh
node dist/cli.js world-challenge
node dist/cli.js world-search --budget 1000 --depth 3
```

The weak verifier checks a completion claim.
The task oracle checks the outcome, protected records, and authority separately.
The challenge changes valid fixtures and retains disagreements.
The search reports the tested action alphabet, depth, budget, and unexplored cases.
It does not prove correctness outside that declared space.

## 6. Let evidence select the next task

```sh
node dist/cli.js world-curriculum --budget 8
```

A curriculum selects what an agent practices next.
Avalon first covers unseen eligible tasks, then uses failures and verifier disagreements to rank seen tasks.
Its current demonstration uses a known-good script.
The schedule adapts to evidence. The script itself does not learn.

An important future experiment connects a learning policy to this schedule.
Compare it with random selection and a fixed schedule under the same interaction budget.
Evaluate on independently authored task families.
Preserve failures and report uncertainty instead of selecting only successful seeds.

## 7. Ask what a result establishes

A format check establishes structure.
A stage comparison establishes preservation under a declared policy.
A counterexample establishes one verifier failure.
A held-out policy evaluation can establish performance on its chosen test distribution.
None of these alone establishes general intelligence, market value, or real-world success.

That distinction is the foundation of Avalon's learning-world strategy.
