import { link, lstat, mkdir, readdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { digest, ensureDirectory, inspectPath, missing, readBytes, writeNew } from "./io.js";

export type BundleFile = { source: string; target: string; bytes: Buffer };
type BundleWrite = BundleFile & ({ kind: "create" } | { kind: "replace"; previousSha256: string });

export async function collectBundle(input: {
  root: string; source: string; target: string; accept: (name: string) => boolean;
}): Promise<BundleFile[]> {
  const files: BundleFile[] = [];
  let totalBytes = 0;
  async function collect(location: { source: string; target: string }): Promise<void> {
    const info = await inspectPath(input.root, location.source);
    if (!info.exists) throw new Error("The packaged bundle is missing. Build or install the complete Avalon package.");
    for (const entry of await readdir(info.absolute, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("The packaged bundle contains a symbolic link.");
      const source = `${location.source}/${entry.name}`;
      const target = `${location.target}/${entry.name}`;
      if (entry.isDirectory()) await collect({ source, target });
      else {
        if (!entry.isFile()) throw new Error("The packaged bundle contains a special file.");
        if (!input.accept(entry.name)) continue;
        if (files.length >= 512) throw new Error("The packaged bundle exceeds the file limit.");
        const bytes = await readBytes(input.root, source);
        totalBytes += bytes.length;
        if (totalBytes > 16 * 1024 * 1024) throw new Error("The packaged bundle exceeds the byte limit.");
        files.push({ source, target, bytes });
      }
    }
  }
  await collect({ source: input.source, target: input.target });
  return files;
}

export async function pendingBundle(input: { root: string; files: BundleFile[]; replace?: ReadonlyMap<string, string> }): Promise<BundleWrite[]> {
  if (input.files.length > 512 || input.files.reduce((sum, file) => sum + file.bytes.length, 0) > 16 * 1024 * 1024) {
    throw new Error("The installation exceeds the bundle limits.");
  }
  const pending: BundleWrite[] = [];
  const targets = new Set<string>();
  for (const file of input.files) {
    if (targets.has(file.target)) throw new Error("The installation contains a duplicate target.");
    targets.add(file.target);
    const path = await inspectPath(input.root, file.target);
    if (!path.exists) pending.push({ ...file, kind: "create" });
    else {
      const existing = await readBytes(input.root, file.target);
      if (existing.equals(file.bytes)) continue;
      const previousSha256 = input.replace?.get(file.target);
      if (previousSha256 !== undefined && digest(existing) === previousSha256) pending.push({ ...file, kind: "replace", previousSha256 });
      else {
        const label = file.target.startsWith(".avalon/runtime/") ? "runtime" : "skill";
        throw new Error(`An installed ${label} differs. Preserve the local edits before reinstalling.`);
      }
    }
  }
  return pending;
}

async function restoreRegularFile(input: { backup: string; target: string }): Promise<string> {
  try {
    const info = await lstat(input.backup);
    if (!info.isFile() || info.isSymbolicLink()) return "The displaced nonregular item is retained for inspection.";
    await link(input.backup, input.target);
    return "The displaced regular file is restored. Its private backup is retained.";
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST") {
      return "The current target is preserved. Inspect the private backup before restoring it.";
    }
    return "Automatic restoration cannot complete. Inspect the installed target and the private backup.";
  }
}

async function replacePreserving(input: { root: string; file: BundleWrite & { kind: "replace" } }): Promise<string> {
  await ensureDirectory(input.root, ".avalon");
  const ignore = ".avalon/.gitignore";
  if (!(await inspectPath(input.root, ignore)).exists) await writeNew(input.root, ignore, "*\n");
  if ((await readBytes(input.root, ignore)).toString("utf8") !== "*\n") throw new Error("Keep the private backup directory outside version control.");
  await ensureDirectory(input.root, ".avalon/install-backups");
  const directory = `.avalon/install-backups/${randomUUID()}`;
  const backupDirectory = await inspectPath(input.root, directory);
  await mkdir(backupDirectory.absolute, { mode: 0o700 });
  const backup = `${directory}/displaced`;
  const backupPath = await inspectPath(input.root, backup);
  const target = await inspectPath(input.root, input.file.target);
  const temporary = `${input.file.target}.${randomUUID()}.tmp`;
  await writeNew(input.root, temporary, input.file.bytes);
  const temp = await inspectPath(input.root, temporary);
  try {
    await rename(target.absolute, backupPath.absolute);
    if (digest(await readBytes(input.root, backup)) !== input.file.previousSha256) {
      throw new Error("The displaced file differs from the reviewed stock.");
    }
    await link(temp.absolute, target.absolute);
    return backup;
  } catch {
    const restoration = await restoreRegularFile({ backup: backupPath.absolute, target: target.absolute });
    throw new Error(`The upgrade cannot complete. Backup: ${backup}. ${restoration}`);
  } finally {
    try { await unlink(temp.absolute); }
    catch (cause) {
      if (!missing(cause)) throw new Error(`Cannot remove the private temporary file. Inspect ${temporary} and backup ${backup}.`);
    }
  }
}

export async function writeBundle(input: { root: string; files: BundleWrite[] }): Promise<string[]> {
  const backups: string[] = [];
  try {
    for (const file of input.files) {
      await ensureDirectory(input.root, relative(input.root, dirname(resolve(input.root, file.target))));
      if (file.kind === "create") await writeNew(input.root, file.target, file.bytes);
      else backups.push(await replacePreserving({ root: input.root, file }));
    }
  } catch (cause) {
    if (!backups.length) throw cause;
    const message = cause instanceof Error ? cause.message : "The bundle cannot complete.";
    throw new Error(`${message}\nEarlier backups: ${backups.join(", ")}.`);
  }
  return backups;
}
