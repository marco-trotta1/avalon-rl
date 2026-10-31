# Agent command implementation

## Done criteria

Ship all 20 reviewed workflows as an installable agent package.
Exercise command discovery, project installation, private run records, artifact validation, and supported RL execution.
Verify the built packages in a clean project before publication.
Keep unsupported integrations explicit. Preserve the private research directory.

## Swarm plan

- [x] Frame: define the release and separate ownership.
- [x] Fan out: implement workflows, runtime, and a real training adapter.
- [x] Aggregate: integrate the slices and address review findings.
- [ ] Report: publish the tested release and its verification record.

The workers start from source commit `5c758114b3aae2ce806de084994d90cf5205606f`.
The swarm partitions implementation responsibilities. It does not race competing implementations.
The available workers inherit the host model. The skill's fallback model is unavailable in this session.

## Ownership

- Workflow worker: the skills, plugin manifests, and command guide.
- Runtime worker: `src/agent`, agent tests, and the installer.
- Training worker: the new Python trainer modules and their tests.
- Coordinator: CLI integration, packaging, release checks, independent review, and publication.

## Runtime interface

The CLI prefix is `avalon agent`.
The runtime provides `commands`, `doctor`, `init`, `start`, `record`, `finish`, `resume`, and `install`.
Use `--project` to select a project explicitly.
The host executes the workflow. Starting a run does not execute training or establish a result.
The runtime keeps private project state under `.avalon` and does not call a model provider.
The workflows use the host's reasoning, filesystem, execution, research, and agent capabilities.

The Python CLI adds a bounded Gymnasium trainer, checkpoint evaluation, and a credit audit.
Existing audit and world commands remain available.
