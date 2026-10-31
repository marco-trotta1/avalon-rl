# Diagnose a learned trace

Build the Node CLI and install the Python package first.
Use a trusted local CLI. This example executes that build as a separate process.
Choose a new output directory.

```sh
python examples/policy/diagnose.py --avalon-cli "$PWD/dist/cli.js" --output /tmp/avalon-diagnosis
```

The example exports a finite table through the existing TypeScript world reducer.
It writes the declared trace contract before the learner updates its weights.
It executes 2,400 actual Q updates with seed 7 and the history reward.
It exports the learned episode and a restored side effect as separate world snapshots.
The restored example changes an unauthorized payment, restores it, completes the requested payment, and finishes.
Its final-state reward remains positive.
The independent Python outcome check rejects its action history.
The TypeScript trace contract retains the same violation.

The output retains the training updates, policy hash, table, contract, snapshots, and both audits.
The report compares the independent outcomes with the trace findings.
The files use owner-only permissions and preserve existing paths.

This example contains two controlled synthetic cases.
It does not estimate a detection rate or establish policy generalization.
The independent checks share the published task specification.
The entry hash binds the CLI entry file, not all imported modules.
