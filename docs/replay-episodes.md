# Evaluate policies in a trusted world

The host world owns observations, action validation, rewards, and ending flags.
The isolated policy receives an observation and returns an action.
The policy cannot submit its own reward or success flag to the evaluator.
The default Docker actor has a 60-second lifetime budget and a separate timeout for each action.
Docker endpoint and image checks precede that budget. Each check has its own 10-second timeout.
Container cleanup follows execution and has a separate timeout.

Use `run_episode_campaign(task, candidates, image, timeout_seconds=5)` in the Python API.
Each candidate maps a label to a file snapshot.
The task declares the policy function, world, paired seeds, step budget, and minimum return.
The campaign evaluates the observed policy, reference, controls, and candidates on the same seeds.

A completed episode passes when its undiscounted return meets the declared minimum.
The comparison uses absolute tolerance `1e-9` for accumulated floating-point rewards.
Each reference episode and positive control must pass.
A negative control must produce a valid completed failure.
Invalid actions, crashes, protocol errors, and infrastructure timeouts remain inconclusive.
They cannot satisfy a negative control.

The step budget produces valid truncation when the world does not terminate first.
The trace preserves termination and truncation separately.
Each trace includes its seed, observations, actions, host rewards, world metadata, and artifact hashes.
The trace retains at most 500 transitions and 1 MiB per episode.
Trace overflow makes the result inconclusive.

Unconfirmed container or world cleanup stops all later actor and world creation.
The report preserves outstanding container names and skipped episodes.
Confirm removal before starting another campaign.

## Add another world

Pass a trusted `adapter_factory(spec, max_steps=...)` to the campaign.
The adapter implements `reset(seed=...)`, `step(action)`, `metadata()`, and `close()`.
Its step returns a `Transition` with the observation, reward, termination flag, and truncation flag.
Validate actions inside the host adapter before applying them.
Record the world implementation hash and dependency versions in the metadata.
The manifest never imports an adapter automatically.

The adapter runs trusted code on the host.
Physical robots and external services require separate authorization and safety boundaries.
The built-in interface does not supply those boundaries.
The optional `actor_factory` parameter supports trusted test injection.
Results from a fake actor are unit-test evidence, not Docker execution evidence.
Custom actor factories run trusted code. They do not necessarily supply process isolation or lifetime bounds.

Use `render_episode_html(report)` for an escaped report without external assets.
Keep traces private because observations and actions can contain private data.

## Evidence limits

The paired seeds support comparison within this task.
They do not establish generalization to new worlds or model improvement.
Each seed runs once per policy. The campaign does not estimate statistical uncertainty.
The built-in world and Docker actor make zero model API calls. Their model API cost is zero USD.
Custom factories can call external services. Their external calls and costs remain unknown.
Compute, engineering, and candidate generation costs remain unpriced.
Retain failed and inconclusive episodes when reporting results.
