# Hosted validation

The workflow checks pull requests and the default branch.
It installs the locked Node dependencies without lifecycle scripts.
It checks types, runs the Node tests, and checks the source privacy boundary.
It installs the tested Python dependencies, then installs the local Python package with `python -m pip install --no-deps ./python`.
The regular installation builds a wheel and installs its distribution metadata.
The experiment reads that metadata to record the installed `avalon-rl-lab` version.
`PYTHONPATH` exposes source modules but does not install distribution metadata.
Changing a source version does not update the installed metadata. Install the package again after a version change.
The `--no-deps` option retains the recorded dependency versions.
The workflow then runs the real local pipeline tests.
The Python tests receive the built Node CLI path.
The external comparison test must run instead of skipping.

The workflow pins the action commits, Node 22.22.3, and Python 3.13.5.
The Python dependency file records the tested package versions.
The tests use synthetic local data.
The workflow uses read-only repository permission.
It does not publish packages, deploy services, or upload experience.

Local checks do not establish a successful hosted run.
Inspect the current GitHub check result before claiming that hosted validation passes.

The release workflow installs the packaged tools and executes a CartPole sweep through the installed Hoeffding selector.
It preserves a selected or inconclusive result and rejects execution errors before uploading the release artifacts.
