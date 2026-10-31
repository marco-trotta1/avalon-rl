import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rmdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function projectRoot(value: string): Promise<string> {
  const path = await realpath(resolve(value));
  if (!(await lstat(path)).isDirectory()) throw new Error("Select an existing project directory.");
  return path;
}

export function localPath(root: string, value: string): { absolute: string; relative: string } {
  if (value.includes("\0") || value.includes("\\")) throw new Error("Use a local path without backslashes or null characters.");
  const absolute = resolve(root, value);
  const name = relative(root, absolute);
  if (!name || isAbsolute(name) || name === ".." || name.startsWith(`..${sep}`)) {
    throw new Error("Keep the file inside the selected project.");
  }
  return { absolute, relative: name.split(sep).join("/") };
}

export async function inspectPath(root: string, value: string): Promise<{ absolute: string; relative: string; exists: boolean }> {
  const path = localPath(root, value);
  const parts = path.relative.split("/");
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error("Do not use symbolic links for agent files.");
      if (index < parts.length - 1 && !info.isDirectory()) throw new Error("A parent path is not a directory.");
    } catch (cause) {
      if (missing(cause)) return { ...path, exists: false };
      throw cause;
    }
  }
  return { ...path, exists: true };
}

export function missing(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

export async function ensureDirectory(root: string, value: string): Promise<void> {
  const path = localPath(root, value);
  let current = root;
  for (const part of path.relative.split("/")) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (cause) {
      if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST")) throw cause;
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Use a real directory for agent state.");
  }
}

export async function readBytes(root: string, value: string, maxBytes = MAX_JSON_BYTES): Promise<Buffer> {
  const path = await inspectPath(root, value);
  if (!path.exists) throw new Error("The required local file does not exist.");
  const file = await open(path.absolute, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error("Use a regular file within the byte limit.");
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= maxBytes) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error("The file exceeds the byte limit.");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, size);
  } finally { await file.close(); }
}

export async function fingerprint(root: string, value: string): Promise<{ path: string; sha256: string; bytes: number }> {
  const path = await inspectPath(root, value);
  if (!path.exists) throw new Error("The declared input or artifact does not exist.");
  const file = await open(path.absolute, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const info = await file.stat({ bigint: true });
    if (!info.isFile() || info.size > BigInt(MAX_ARTIFACT_BYTES)) throw new Error("Use a regular artifact within the 256 MiB limit.");
    const hash = createHash("sha256");
    let size = 0;
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > MAX_ARTIFACT_BYTES) throw new Error("The artifact exceeds the 256 MiB limit.");
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat({ bigint: true });
    if (after.size !== info.size || after.mtimeNs !== info.mtimeNs) throw new Error("The file changes during its fingerprint check.");
    return { path: path.relative, sha256: hash.digest("hex"), bytes: size };
  } finally { await file.close(); }
}

export async function readJson(root: string, value: string): Promise<unknown> {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(root, value))); }
  catch { throw new Error("Cannot read the agent JSON file. Check its format and byte limit."); }
}

export async function writeNew(root: string, value: string, data: string | Buffer): Promise<void> {
  const path = await inspectPath(root, value);
  if (path.exists) throw new Error("The output already exists. Existing files are preserved.");
  const file = await open(path.absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(data); }
  finally { await file.close(); }
}

export async function writeJson(root: string, value: string, data: object): Promise<void> {
  const text = JSON.stringify(data, null, 2) + "\n";
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new Error("The agent record exceeds the 1 MiB limit.");
  await writeNew(root, value, text);
}

export async function withStateLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await ensureDirectory(root, ".avalon");
  const ignore = await inspectPath(root, ".avalon/.gitignore");
  if (!ignore.exists) {
    try { await writeNew(root, ".avalon/.gitignore", "*\n"); }
    catch (cause) { if (!(await inspectPath(root, ".avalon/.gitignore")).exists) throw cause; }
  }
  if ((await readBytes(root, ".avalon/.gitignore")).toString("utf8") !== "*\n") {
    throw new Error("Keep all private agent state ignored with a single * rule in .avalon/.gitignore.");
  }
  const lock = await inspectPath(root, ".avalon/.lock");
  if (lock.exists) throw new Error("Another agent operation holds the state lock. Check it before retrying.");
  try { await mkdir(lock.absolute, { mode: 0o700 }); }
  catch { throw new Error("Another agent operation holds the state lock. Check it before retrying."); }
  try { return await action(); }
  finally { await rmdir(lock.absolute); }
}
