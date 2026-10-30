import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { MAX_SNAPSHOT_BYTES } from "./contract.js";

export type OutputDestination = { type: "stdout" } | { type: "file"; path: string };

export async function readLocalText(path: string, { maxBytes = MAX_SNAPSHOT_BYTES }: { maxBytes?: number } = {}): Promise<string> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile()) throw new Error("The input must be a regular file.");
      if (info.size > maxBytes) throw new Error("The input exceeds the byte limit.");
      const chunks: Buffer[] = [];
      let length = 0;
      while (length <= maxBytes) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - length + 1));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
        if (length > maxBytes) throw new Error("The input exceeds the byte limit.");
        chunks.push(chunk.subarray(0, bytesRead));
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
    } finally { await file.close(); }
  } catch {
    throw new Error("Cannot read the input. Use a regular UTF-8 file within the documented byte limit.");
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
