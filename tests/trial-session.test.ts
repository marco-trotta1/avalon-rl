import { mkdtemp, readFile, writeFile, stat, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initTrial } from "../src/trial/init.js";
import { exportTrialTask, loadSession, replaySession, runSession } from "../src/trial/session.js";
import { parseSession } from "../src/trial/session-contract.js";
import { requestProcess } from "../src/trial/process.js";
import { runTrialCli } from "../src/trial/cli.js";
import { auditTraceContract } from "../src/trace/audit.js";
import { parseSnapshot } from "../src/lab/contract.js";
import { parseTraceContract } from "../src/trace/contract.js";
import { installRuntime } from "../src/agent/runtime.js";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "avalon-session-"));
  const project = join(root, "project with spaces");
  await initTrial(project);
  return { root, project, data: join(project, "session.json") };
}

describe("executable team trial", () => {
  it("starts a trial from the project-installed agent runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "avalon-installed-session-"));
    const installed = await installRuntime({ root, dryRun: false });
    const result = spawnSync(process.execPath, [join(root, installed.runtime.entrypoint), "trial", "init", "--out", join(root, "trial")],
      { cwd: root, encoding: "utf8", timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    await access(join(root, "trial", "adapter.py"));
  }, 15_000);
  it("executes SQLite actions, replays every case, and exposes the outcome regression", async () => {
    const { root, data } = await workspace();
    const out = join(root, "run");
    expect(await runSession({ data, out })).toBe(5);
    const report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    expect(report.cases.map((item: { avalon: { status: string } }) => item.avalon.status))
      .toEqual(["mismatch", "mismatch", "match", "unknown", "match"]);
    const collection = JSON.parse(await readFile(join(out, "collection.json"), "utf8"));
    expect(collection.records.every((item: { replay: { matches: boolean } }) => item.replay.matches)).toBe(true);
    expect(collection.records[1].judgment.evidence.journal).toEqual([
      ["protected", 900, 901], ["protected", 901, 900], ["target", 0, 1300],
    ]);
    expect((await stat(out)).mode & 0o777).toBe(0o700);
    expect((await stat(join(out, "report.json"))).mode & 0o777).toBe(0o600);
    for (const id of ["false-completion", "corrected"]) {
      const snapshot = parseSnapshot(JSON.parse(await readFile(join(out, "cases", id, "snapshot.json"), "utf8")) as unknown);
      const contract = parseTraceContract(JSON.parse(await readFile(join(out, "cases", id, "contract.json"), "utf8")) as unknown);
      expect(auditTraceContract({ snapshot, contract }).status).toBe(id === "corrected" ? "match" : "mismatch");
    }
    expect(await replaySession({ bundle: out, out: join(root, "replay") })).toBe(0);
    const exported = join(root, "exported");
    await exportTrialTask({ bundle: out, caseId: "restored-write", out: exported });
    expect(await runSession({ data: join(exported, "session.json"), out: join(root, "export-run") })).toBe(0);
    await writeFile(join(out, "report.json"), "{}\n");
    await expect(replaySession({ bundle: out, out: join(root, "tampered") })).rejects.toThrow(/sealed/);
    await expect(access(join(root, "tampered"))).rejects.toThrow();
  }, 30_000);

  it("rejects source drift and preserves an existing workspace", async () => {
    const { root, data, project } = await workspace();
    const session = await loadSession(data);
    await writeFile(data, JSON.stringify({ ...session, cases: [session.cases[2]] }));
    const out = join(root, "run");
    expect(await runSession({ data, out })).toBe(0);
    await expect(initTrial(project)).rejects.toThrow();
    await writeFile(join(project, "adapter.py"), "raise RuntimeError('changed')\n");
    await expect(replaySession({ bundle: out, out: join(root, "changed") })).rejects.toThrow(/source changes/);
  }, 15_000);

  it("keeps failed requests and partial artifacts without a completion manifest", async () => {
    const { root, data, project } = await workspace();
    const session = await loadSession(data);
    await writeFile(join(project, "adapter.py"), "import json,sys\nr=json.load(sys.stdin)\nprint('{}')\n");
    await writeFile(data, JSON.stringify({ ...session, cases: [session.cases[0]] }));
    const out = join(root, "failed");
    await expect(runSession({ data, out })).rejects.toThrow();
    expect(JSON.parse(await readFile(join(out, "failure.json"), "utf8")).status).toBe("failed");
    await access(join(out, "requests", "00000-request.json"));
    await expect(access(join(out, "manifest.json"))).rejects.toThrow();
  });

  it("validates plans and group boundaries before execution", async () => {
    const { data } = await workspace();
    const session = await loadSession(data);
    expect(() => parseSession({ ...session, limits: { ...session.limits, maxSteps: 1 } })).toThrow(/step limit/);
    expect(() => parseSession({ ...session, cases: [session.cases[0], { ...session.cases[1], split: "holdout" }] })).toThrow(/one split/);
    expect(() => parseSession({ ...session, cases: [{ ...session.cases[0], id: "../outside" }] })).toThrow();
    expect(await runTrialCli(["run", "--out", "x", "--out", "y"])).toBe(1);
  });

  it("records an agent budget excess before its action can execute", async () => {
    const { root, data, project } = await workspace();
    const session = await loadSession(data);
    await writeFile(join(project, "agent.py"), "import json,sys\njson.load(sys.stdin)\nprint(json.dumps({'action':{'op':'close'},'costUsd':1}))\n");
    await writeFile(data, JSON.stringify({ ...session, cases: [session.cases[4]] }));
    const out = join(root, "budget-excess");
    await expect(runSession({ data, out })).rejects.toThrow(/above the case budget/);
    const requests = await Promise.all((await readdir(join(out, "requests"))).filter(name => name.endsWith("-request.json"))
      .map(name => readFile(join(out, "requests", name), "utf8")));
    expect(requests.some(text => JSON.parse(text).request.operation === "step")).toBe(false);
    await access(join(out, "failure.json"));
  });

  it("returns a failing result when fresh resets diverge", async () => {
    const { root, data, project } = await workspace();
    const session = await loadSession(data);
    const adapter = await readFile(join(project, "adapter.py"), "utf8");
    await writeFile(join(project, "adapter.py"), adapter.replace('observation = {"closed": bool(closed), "goal_cents": goal}',
      'observation = {"closed": bool(closed), "goal_cents": goal, "workspace": str(workspace)}'));
    await writeFile(data, JSON.stringify({ ...session, cases: [session.cases[2]] }));
    const out = join(root, "divergent");
    expect(await runSession({ data, out })).toBe(4);
    const collection = JSON.parse(await readFile(join(out, "collection.json"), "utf8"));
    expect(collection.records[0].replay).toMatchObject({ matches: false, initialMatches: false, firstDifferentStep: 0 });
  });

  it("retains bounded stderr for failed process diagnosis", async () => {
    const { root, data, project } = await workspace();
    await writeFile(join(project, "adapter.py"), "import sys\nsys.stdin.read()\nsys.stderr.write('private diagnostic')\nsys.exit(1)\n");
    const out = join(root, "process-failure");
    await expect(runSession({ data, out })).rejects.toThrow(/exits with an error/);
    const error = JSON.parse(await readFile(join(out, "requests", "00000-error.json"), "utf8"));
    expect(error.stderr).toBe("private diagnostic");
    expect(error.exitCode).toBe(1);
  });

  it("bounds process output and time and rejects malformed JSON", async () => {
    const { root, data } = await workspace();
    const session = await loadSession(data);
    const script = join(root, "process.mjs");
    const spec = { executable: process.execPath, script };
    await writeFile(script, "process.stdout.write('x'.repeat(10000));\n");
    const limits = parseSession({ ...session, limits: { ...session.limits, maxOutputBytes: 1024, timeoutMs: 200 } }).limits;
    await expect(requestProcess({ spec, request: {}, limits })).rejects.toThrow(/output limit/);
    await writeFile(script, "setInterval(() => {}, 1000);\n");
    await expect(requestProcess({ spec, request: {}, limits })).rejects.toThrow(/deadline/);
    await writeFile(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('invalid'));\n");
    await expect(requestProcess({ spec, request: {}, limits })).rejects.toThrow(/JSON response/);
  });
});
