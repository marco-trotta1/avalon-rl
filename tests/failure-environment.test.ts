import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoFailureCase } from "../src/failure/case.js";
import { createFailureEnvironment, readFailureEnvironment } from "../src/failure/environment.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function workspace() {
  const path = await mkdtemp(join(tmpdir(), "avalon-failure-env-"));
  directories.push(path);
  return path;
}

it("creates only initial files and refuses to reset an existing directory", async () => {
  const directory = join(await workspace(), "task");
  const failureCase = demoFailureCase();
  await createFailureEnvironment({ failureCase, directory });
  expect(await readFailureEnvironment({ failureCase, directory })).toEqual(failureCase.files.initial);
  expect((await stat(directory)).mode & 0o777).toBe(0o700);
  const first = Object.keys(failureCase.files.initial)[0]!;
  await writeFile(join(directory, first), "local work");
  await expect(createFailureEnvironment({ failureCase, directory })).rejects.toThrow();
  expect(await readFile(join(directory, first), "utf8")).toBe("local work");
});

it("rejects symbolic links and records missing files as absent", async () => {
  const root = await workspace();
  const directory = join(root, "task");
  await mkdir(directory);
  const failureCase = demoFailureCase();
  expect(await readFailureEnvironment({ failureCase, directory })).toEqual({});
  const first = Object.keys(failureCase.files.initial)[0]!;
  await mkdir(join(directory, first, ".."), { recursive: true });
  await writeFile(join(root, "secret"), "private");
  await symlink(join(root, "secret"), join(directory, first));
  await expect(readFailureEnvironment({ failureCase, directory })).rejects.toThrow();
});

it("preserves a leading UTF-8 byte order mark for exact grading", async () => {
  const directory = join(await workspace(), "task");
  const failureCase = demoFailureCase();
  await createFailureEnvironment({ failureCase, directory });
  await writeFile(join(directory, "config.json"), "\ufeff" + failureCase.files.initial["config.json"]);
  const files = await readFailureEnvironment({ failureCase, directory });
  expect(files["config.json"]).toBe("\ufeff" + failureCase.files.initial["config.json"]);
});

it("rejects oversized candidate content at the input boundary", async () => {
  const directory = join(await workspace(), "task");
  const failureCase = demoFailureCase();
  await createFailureEnvironment({ failureCase, directory });
  await writeFile(join(directory, "config.json"), "x".repeat(65_537));
  await expect(readFailureEnvironment({ failureCase, directory })).rejects.toThrow();
});

it("rejects a linked task directory and linked intermediate directory", async () => {
  const root = await workspace();
  const directory = join(root, "task");
  const failureCase = demoFailureCase();
  await createFailureEnvironment({ failureCase, directory });
  const linked = join(root, "linked");
  await symlink(directory, linked);
  await expect(readFailureEnvironment({ failureCase, directory: linked })).rejects.toThrow();
  await rm(join(directory, "src"), { recursive: true });
  await mkdir(join(root, "outside"));
  await writeFile(join(root, "outside", "add.ts"), "private");
  await symlink(join(root, "outside"), join(directory, "src"));
  await expect(readFailureEnvironment({ failureCase, directory })).rejects.toThrow();
});

it("rejects invalid UTF-8 and a directory in place of a file", async () => {
  const directory = join(await workspace(), "task");
  const failureCase = demoFailureCase();
  await createFailureEnvironment({ failureCase, directory });
  await writeFile(join(directory, "config.json"), Buffer.from([0xff]));
  await expect(readFailureEnvironment({ failureCase, directory })).rejects.toThrow();
  await rm(join(directory, "config.json"));
  await mkdir(join(directory, "config.json"));
  await expect(readFailureEnvironment({ failureCase, directory })).rejects.toThrow();
});
