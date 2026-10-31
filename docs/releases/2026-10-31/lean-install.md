# Avalon 0.6 installation

## Delivered behavior

Run one command from the project directory:

```sh
npx --yes https://github.com/marco-trotta1/avalon-rl/releases/latest/download/avalon.tgz install codex
```

Select `claude` or `cursor` for another agent.
The documented procedure uses one terminal command, from two in 0.5, across the three host recipes.
This counts instructions. It does not measure installation time or human effort.

Installation defaults to the current directory and includes all 20 skills.
The project receives an Avalon runtime with its production dependency and licenses.
The runtime works after the temporary npm cache and original archive are removed.
It requires Node.js 22.12 or later. It does not require a global Avalon installation.

The runtime-only option prepares native plugin sessions without duplicating their host skills.
Python remains optional until a workflow needs it.
The release includes `avalon.tgz`, a byte-identical alias of the versioned Node archive.
The release manifest and checksums bind both names to the same bytes.

## Existing installations

Matching files remain unchanged. Differing local customizations remain protected.
The exact untouched 0.5 shared protocol upgrades automatically.
The installer retains the displaced file under ignored `.avalon/install-backups` and returns its path.
Detected concurrent edits stop an upgrade. The installer preserves the displaced content and any recreated target.
These backups preserve filesystem content. They are not authenticated immutable snapshots.

An explicit blank project path now fails before writes. An omitted project path selects the current directory.
The previous `avalon agent install --host HOST --project PATH` syntax remains supported.

## Native plugins

Claude Code 2.1.278 validates, installs, enables, and lists all 20 skills through the new marketplace catalog.
The supported CLI route registers the marketplace, then installs `avalon@avalon`.
That CLI version rejects an install `--marketplace` flag.
The Cursor catalog passes its official schema. Its GitHub import UI remains untested.
Codex 0.133 rejects the catalogs' root source. Use the tested project installer for Codex.

## Verification

The isolated source passes 234 Node tests and 257 Python tests, with no skipped Python tests.
Type, privacy, agent package, and whitespace checks pass.
Regressions reproduce the blank-path and concurrent-edit failures before their fixes.

The [package receipt](lean-install-evidence.json) records fresh one-off setup for Claude, Codex, and Cursor.
After cache and archive deletion, every copied runtime lists the 20 commands and executes the clean audit.
The test also upgrades a real 0.5 installation and preserves a modified skill.
No model inference runs during those checks.

The release workflow repeats one-off setup and cache deletion before it preserves the package artifacts.
Use the published release receipt for the exact source commit and hosted workflow results.
