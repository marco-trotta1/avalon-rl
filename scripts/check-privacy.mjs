import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(ts|tsx|css)$/.test(path)) {
      const content = await readFile(path, "utf8");
      if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/.test(content)) {
        failures.push(`${relative(root, path)} contains a network or storage API.`);
      }
      if (/https?:\/\//.test(content.replace(/href="https:\/\/[^"\n]+"/g, ""))) {
        failures.push(`${relative(root, path)} contains an external resource outside an explicit link.`);
      }
    }
  }
}
await inspect(resolve(root, "src"));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)(private-data|uploads|reports|local|\.env[^/]*)\b|\.(jsonl|ndjson|csv|parquet|arrow|h5|hdf5|pem|key|p12|sqlite|db)$/i.test(file)) {
    failures.push(`Remove the private data path from Git: ${file}`);
  }
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Privacy source check passes. No app network or browser storage APIs. No tracked private data files.\n");
}
