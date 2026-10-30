# Release artifacts

The Node package includes the executable examples.
Private research, snapshots, and witnesses remain outside the package.
The release workflow tests the source and installs both package formats.
Run the workflow against the intended commit before publishing its artifacts.

The manifest records the complete source commit and both package hashes.
The checksums establish byte identity. They do not establish reproducible builds or package safety.
The Python wheel can differ between builds because its archive timestamps can differ.

Build the artifacts from a clean checkout:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run check:privacy
AVALON_CLI="$PWD/dist/cli.js" PYTHONPATH="$PWD/python/src" python -m pytest python/tests -q
mkdir release
npm pack --pack-destination release
python -m pip wheel --no-deps --wheel-dir release ./python
node scripts/release-manifest.mjs --directory release --commit "$(git rev-parse HEAD)"
```

Use the release notes to identify the validation run and experiment limits.
Publish only the reviewed packages, manifest, checksums, and public synthetic evidence.
