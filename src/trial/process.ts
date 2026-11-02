import { spawn } from "node:child_process";
import type { Json } from "../lab/contract.js";
import type { ProcessSpec, Session } from "./session-contract.js";

export class ProcessRequestError extends Error {
  constructor(message: string, readonly details: { exitCode: number | null; stdout: string; stderr: string }) {
    super(message);
  }
}

export async function requestProcess(options: {
  spec: ProcessSpec; request: Json; limits: Session["limits"];
}): Promise<unknown> {
  const { spec, request, limits } = options;
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(spec.executable, [spec.script], { shell: false, detached: grouped, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      try {
        if (grouped && child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { child.kill("SIGKILL"); }
    };
    const timer = setTimeout(() => stop("The adapter or agent exceeds the request deadline."), limits.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      const remaining = Math.max(0, limits.maxOutputBytes - outputBytes);
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (outputBytes > limits.maxOutputBytes) stop("The adapter or agent exceeds the output limit.");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const remaining = Math.max(0, limits.maxOutputBytes - outputBytes);
      if (remaining > 0) errors.push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (outputBytes > limits.maxOutputBytes) stop("The adapter or agent exceeds the output limit.");
    });
    child.stdin.on("error", () => stop("The adapter or agent closes its input unexpectedly."));
    child.on("error", () => { failure ??= new Error("Cannot start the configured adapter or agent executable."); });
    child.on("close", code => {
      clearTimeout(timer);
      const details = { exitCode: code, stdout: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8") };
      if (failure) { reject(new ProcessRequestError(failure.message, details)); return; }
      if (code !== 0) { reject(new ProcessRequestError("The adapter or agent exits with an error. Inspect the private response record.", details)); return; }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        resolve(JSON.parse(text) as unknown);
      } catch { reject(new ProcessRequestError("The adapter or agent must return one UTF-8 JSON response.", details)); }
    });
    child.stdin.end(JSON.stringify(request) + "\n");
  });
}
