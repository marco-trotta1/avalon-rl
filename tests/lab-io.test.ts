import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_SNAPSHOT_BYTES } from "../src/lab/contract.js";
import { readLocalText } from "../src/lab/io.js";
import { MAX_AUDIT_REPORT_BYTES } from "../src/lab/report.js";

let directory: string;
beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "avalon-lab-io-")); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("bounded local reads", () => {
  it("decodes UTF-8 across a chunk boundary", async () => {
    const text = "a".repeat(64 * 1024 - 1) + "é";
    const path = join(directory, "utf8.txt");
    await writeFile(path, text);
    expect(await readLocalText(path)).toBe(text);
  });
  it.each([
    { name: "snapshot", maxBytes: MAX_SNAPSHOT_BYTES },
    { name: "report", maxBytes: MAX_AUDIT_REPORT_BYTES },
  ])("rejects a $name file above its byte limit", async ({ name, maxBytes }) => {
    const path = join(directory, `${name}.json`);
    const file = await open(path, "wx", 0o600);
    try { await file.truncate(maxBytes + 1); }
    finally { await file.close(); }
    await expect(readLocalText(path, { maxBytes })).rejects.toThrow("byte limit");
  });
  it("accepts the exact limit and rejects one extra byte", async () => {
    const path = join(directory, "boundary.txt");
    await writeFile(path, "abcd");
    expect(await readLocalText(path, { maxBytes: 4 })).toBe("abcd");
    await writeFile(path, "abcde");
    await expect(readLocalText(path, { maxBytes: 4 })).rejects.toThrow("byte limit");
  });
});
