import { mkdir, open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { failureFilesSchema, type FailureCase, type FailureFiles } from "./case.js";

/** Create a fresh task directory. The caller retains the private checks separately. */
export async function createFailureEnvironment(input: { failureCase: FailureCase; directory: string }): Promise<void> {
  const root = resolve(input.directory);
  await mkdir(root, { mode: 0o700 });
  for (const [path, content] of Object.entries(input.failureCase.files.initial)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const file = await open(destination, "wx", 0o600);
    try { await file.writeFile(content, "utf8"); }
    finally { await file.close(); }
  }
}

/** Read declared task files without following links inside the task directory. */
export async function readFailureEnvironment(input: { failureCase: FailureCase; directory: string }): Promise<FailureFiles> {
  const root = resolve(input.directory);
  if (!(await lstat(root)).isDirectory()) throw new Error("Use a task directory, not a symbolic link.");
  const paths = new Set([
    ...Object.keys(input.failureCase.files.initial),
    ...input.failureCase.checks.map(check => check.path),
  ]);
  const files: Record<string, string> = {};
  let totalBytes = 0;
  for (const path of paths) {
    const parts = path.split("/");
    let current = root;
    let missing = false;
    for (const part of parts.slice(0, -1)) {
      current = join(current, part);
      try {
        if (!(await lstat(current)).isDirectory()) throw new Error("The task path contains a link or a non-directory.");
      } catch (error) {
        if (isMissing(error)) { missing = true; break; }
        throw error;
      }
    }
    if (missing) continue;
    const destination = join(root, ...parts);
    if (!destination.startsWith(root + sep)) throw new Error("The task path leaves the task directory.");
    let file;
    try { file = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if (isMissing(error)) continue; throw error; }
    try {
      if (!(await file.stat()).isFile()) throw new Error("The task input must be a regular file.");
      const buffer = Buffer.alloc(1_048_577);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      totalBytes += length;
      if (length > 1_048_576 || totalBytes > 1_048_576) throw new Error("The task files exceed the byte limit.");
      files[path] = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
    } finally { await file.close(); }
  }
  return failureFilesSchema.parse(files);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
