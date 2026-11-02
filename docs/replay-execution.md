# Execute a behavioral replay

The optional Python runner executes each behavioral test in a new Docker container.
It never executes candidate code directly on the host.
Docker must run, and the requested Python image must already exist locally.
The runner never pulls an image.
This runner supports POSIX systems with a local Unix Docker socket only.
Windows and remote Docker endpoints are unsupported.
The runner resolves `DOCKER_CONTEXT`, then `DOCKER_HOST`, then the current Docker context.
A selected context takes precedence over `DOCKER_HOST`.
The runner rejects an effective endpoint that is not an absolute Unix socket path.
It does not replace a remote setting with a local fallback.
Every image inspection, container launch, and removal pins the resolved endpoint with `docker --host`.
Later environment or context changes cannot redirect that snapshot's commands.

Use `run_snapshot(task, files, image, timeout_seconds=5, split="all")` from `avalon_lab.replay_runner`.
Select `development` for a training interaction and `holdout` for a separate evaluation.
The default `all` selection evaluates both sets.
Keep held-out tests and expected values outside candidate access.

## Container boundary

Each container receives the candidate files, the entry point, and one test input.
It receives no expected value, reference implementation, or other test input.
The host compares the returned JSON value with the expected value.
Booleans require matching types. Integers compare exactly.
Arrays preserve order. Objects must have the same keys.
Float comparisons use relative tolerance `1e-9` and absolute tolerance `1e-12` to permit arithmetic rounding.
Use integer units when the task requires exact quantities.

The container has no network, host mounts, or Docker socket.
The root filesystem is read-only.
The process runs as user `65534:65534` with all Linux capabilities removed.
The container enables `no-new-privileges`.
Its limits are 128 MiB memory, one CPU, 32 processes, and a 16 MiB temporary filesystem.
The runner resolves the image to its immutable local image ID before execution.
The receipt records that ID.

Docker isolation depends on the Docker daemon, kernel, and image.
These controls do not establish a complete security audit.
Do not give the runner an untrusted Docker daemon or image.

## Results and limits

A valid response that differs from the expected value fails the test.
A timeout, output overflow, malformed response, or unsuccessful process remains inconclusive.
The runner limits combined output to 65,536 bytes.
It retains an output hash and reason code instead of raw logs.
The hash covers captured stdout only. Timeouts and output limits can truncate that capture.
It attempts container removal after every execution, including timeouts.
Unconfirmed removal makes the result inconclusive and records the container name for cleanup.
It sets `cleanup_blocked` and stops all remaining test launches.
The receipt retains each unstarted test with the `skipped-cleanup-blocked` reason.
The campaign also stops later snapshots until the unresolved cleanup is handled.

The host checks protected files in the supplied snapshot before execution.
Changes to those files fail the snapshot.
The container also reports protected file hashes after the function call.
Those runtime reports are diagnostics. They are not authenticated evidence of side effects.
Candidate code can modify its interpreter and forge the output protocol.
A matching returned value establishes the observed response only.
It does not prove that a named function executed honestly or that no temporary change occurred.

Each receipt binds the task, candidate files, image ID, selected split, and test outcomes.
Elapsed milliseconds include container startup and execution.
These measurements describe the current run only.
They do not establish a population success rate, model improvement, or a timing advantage.
The runner performs no model calls and records no training effect.

## Verify the runner

Process-control tests use authored host subprocesses to test timeouts and output bounds.
Those tests do not constitute Docker execution evidence.
Enable the separate Docker tests explicitly:

```sh
AVALON_REPLAY_DOCKER=1 PYTHONPATH=python/src python3 -m pytest python/tests/test_replay_runner.py
```

The Docker tests require a local `python:3.11.15-slim` image.
They execute authored Python candidates in real containers.
The tests cover alternative implementations, behavioral failure, protected snapshots, and execution failure.
