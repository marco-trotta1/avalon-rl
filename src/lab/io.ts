import { open } from "node:fs/promises";
import { MAX_SNAPSHOT_BYTES } from "./contract.js";

export type OutputDestination = { type: "stdout" } | { type: "file"; path: string };

export async function readLocalText(path: string): Promise<string> {
  try {
    const file = await open(path, "r");
    try {
      if (!(await file.stat()).isFile()) throw new Error("The input must be a regular file.");
      const buffer = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_SNAPSHOT_BYTES) throw new Error("The input exceeds 10 MiB.");
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    } finally { await file.close(); }
  } catch {
    throw new Error("Cannot read the input. Use a regular UTF-8 file of at most 10 MiB.");
  }
}

export async function writeLocalText({ output, text }: { output: OutputDestination; text: string }): Promise<void> {
  if (output.type === "stdout") {
    process.stdout.write(text);
    return;
  }
  let file;
  try {
    file = await open(output.path, "wx", 0o600);
    await file.writeFile(text, "utf8");
  } catch {
    throw new Error("Cannot create the output. Select a new path in an existing directory.");
  } finally { await file?.close(); }
  process.stderr.write("The private report is written.\n");
}
