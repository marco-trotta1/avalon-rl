import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, withStateLock } from "../src/agent/io.js";
import { finishRun, listRuns, recordRun, resumeRun, startRun } from "../src/agent/runs.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "avalon-agent-runs-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function savedRun({ createdAt = "2026-11-01T12:00:00.000Z", inputs = [] }: { createdAt?: string; inputs?: string[] } = {}) {
  const { directory, next, ...manifest } = await withStateLock(root, () => startRun(root, {
    command: "rl-data", goal: "Inspect the saved evidence.", inputs,
  }));
  await writeFile(join(root, directory, "manifest.json"), JSON.stringify({ ...manifest, createdAt }));
  return { runId: manifest.runId, directory };
}

describe("saved run compatibility", () => {
  it("preserves the stored v1 hashes for each event variant", async () => {
    const runId = "123e4567-e89b-42d3-a456-426614174000";
    const directory = join(root, ".avalon", "runs", runId);
    await mkdir(join(directory, "events"), { recursive: true });
    await writeFile(join(root, "proof.txt"), "Recorded evidence.\n");
    const artifact = { path: "proof.txt", sha256: digest("Recorded evidence.\n"), bytes: 19 };
    const bindings = { metadata: [], inputs: [] };
    const manifest = {
      format: "avalon-agent-run-v1", runId, projectId: digest(root), command: "rl-data",
      goal: "Read the legacy records.", createdAt: "2026-10-30T12:00:00.000Z", status: "planned", bindings,
    };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    const events = [];
    let previous = digest(JSON.stringify(manifest));
    for (const [index, kind] of ["observation", "hypothesis", "decision", "evidence"].entries()) {
      const event = {
        format: "avalon-agent-event-v1", sequence: index + 1, previous,
        createdAt: "2026-10-30T12:00:01.000Z", kind, message: "The legacy event remains readable.",
        artifact, ...(kind === "decision" ? { bindings } : {}),
      };
      events.push(event);
      previous = digest(JSON.stringify(event));
      await writeFile(join(directory, "events", `${String(index + 1).padStart(6, "0")}.json`), JSON.stringify(event));
    }
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "avalon-agent-result-v1", runId, status: "complete", summary: "The checks complete.",
      finishedAt: "2026-10-30T12:00:02.000Z", lastEvent: previous, events: events.length,
      evidenceBasis: "host-supplied artifact records",
    }));
    const restored = await resumeRun(root, runId);
    expect(restored.status).toBe("complete");
    expect(restored.records.map(event => digest(JSON.stringify(event))))
      .toEqual(events.map(event => digest(JSON.stringify(event))));
    expect(restored.result?.lastEvent).toBe(previous);
  });
});

describe("saved run listing", () => {
  it("reports absent state without creating files", async () => {
    const result = await listRuns(root);
    expect(result).toMatchObject({ state: "absent", total: 0, limit: 20, hasMore: false, runs: [] });
    expect(await readdir(root)).toEqual([]);
  });

  it("sorts by creation time and limits the returned runs", async () => {
    const oldest = await savedRun({ createdAt: "2026-10-30T12:00:00.000Z" });
    const newest = await savedRun({ createdAt: "2026-11-01T12:00:00.000Z" });
    const middle = await savedRun({ createdAt: "2026-10-31T12:00:00.000Z" });
    const result = await listRuns(root, { limit: 2 });
    expect(result).toMatchObject({ total: 3, limit: 2, hasMore: true });
    expect(result.runs.map(run => run.runId)).toEqual([newest.runId, middle.runId]);
    expect((await listRuns(root)).runs.map(run => run.runId)).toEqual([newest.runId, middle.runId, oldest.runId]);
  });

  it("isolates malformed records and rejects an arbitrary terminal result", async () => {
    const valid = await savedRun();
    const broken = await savedRun();
    const forged = await savedRun();
    await writeFile(join(root, broken.directory, "manifest.json"), "{");
    await writeFile(join(root, forged.directory, "result.json"), JSON.stringify({ status: "complete" }));
    const result = await listRuns(root);
    expect(result.runs.find(run => run.runId === valid.runId)).toMatchObject({ integrity: "valid", status: "planned" });
    for (const runId of [broken.runId, forged.runId]) {
      expect(result.runs.find(run => run.runId === runId)).toMatchObject({ integrity: "invalid", status: "unavailable" });
    }
  });

  it("reports changed artifact bytes as a record integrity failure", async () => {
    const run = await savedRun();
    await writeFile(join(root, "proof.txt"), "The check completes.\n");
    await recordRun(root, { id: run.runId, kind: "evidence", message: "The check completes.", artifact: "proof.txt", acceptDrift: false });
    await finishRun(root, { id: run.runId, status: "complete", summary: "The evidence is recorded." });
    await writeFile(join(root, "proof.txt"), "The evidence changes.\n");
    expect((await listRuns(root)).runs[0]).toMatchObject({ integrity: "tampered", status: "unavailable", error: expect.stringContaining("artifact changes") });
  });

  it("checks the terminal record against the stored event chain", async () => {
    const run = await savedRun();
    const result = await finishRun(root, { id: run.runId, status: "inconclusive", summary: "The trainer is unavailable." });
    await writeFile(join(root, run.directory, "result.json"), JSON.stringify({ ...result, lastEvent: "0".repeat(64) }));
    expect((await listRuns(root)).runs[0]).toMatchObject({ integrity: "tampered", status: "unavailable", error: expect.stringContaining("terminal run record changes") });
  });

  it("preserves a valid historical result after the project metadata changes", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "old-command" } }));
    const run = await savedRun();
    await finishRun(root, { id: run.runId, status: "inconclusive", summary: "The trainer is unavailable." });
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "new-command" } }));
    expect((await listRuns(root)).runs[0]).toMatchObject({
      integrity: "valid", status: "inconclusive", summary: "The trainer is unavailable.", drift: { status: "changed" },
    });
    await expect(resumeRun(root, run.runId)).rejects.toThrow("--accept-drift");
  });

  it("reports unavailable bindings separately from valid saved records", async () => {
    await writeFile(join(root, "input.txt"), "The declared input.\n");
    await savedRun({ inputs: ["input.txt"] });
    await rm(join(root, "input.txt"));
    expect((await listRuns(root)).runs[0]).toMatchObject({ integrity: "valid", status: "planned", drift: { status: "unavailable" } });
  });

  it("isolates a symlinked run and refuses a symlinked state directory", async () => {
    const run = await savedRun();
    const linkedId = "123e4567-e89b-42d3-a456-426614174000";
    await symlink(join(root, run.directory), join(root, ".avalon", "runs", linkedId));
    const result = await listRuns(root);
    expect(result.runs.find(entry => entry.runId === run.runId)).toMatchObject({ integrity: "valid" });
    expect(result.runs.find(entry => entry.runId === linkedId)).toMatchObject({ integrity: "invalid", error: expect.stringContaining("symbolic links") });
    await rm(join(root, ".avalon"), { recursive: true });
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, ".avalon"));
    await expect(listRuns(root)).rejects.toThrow("symbolic links");
    expect(await readdir(join(root, "outside"))).toEqual([]);
  });

  it("rejects a directory that exceeds the discovery limit", async () => {
    const directory = join(root, ".avalon", "runs");
    await mkdir(directory, { recursive: true });
    for (let start = 0; start < 10001; start += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 10001 - start) }, (_, index) =>
        writeFile(join(directory, `entry-${start + index}`), ""),
      ));
    }
    await expect(listRuns(root)).rejects.toThrow("10,000 entry limit");
  });
});
