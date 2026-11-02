import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.ts$/.test(path)) {
      const content = await readFile(path, "utf8");
      if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/.test(content)) {
        failures.push(`${relative(root, path)} contains a network or browser API.`);
      }
      const imports = relative(root, path) === "src/trial/process.ts"
        ? content.replace('import { spawn } from "node:child_process";', "") : content;
      if (/["'](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads)(?:\/[^"']*)?["']/.test(imports)) {
        failures.push(`${relative(root, path)} imports a network or process execution module.`);
      }
      if (/https?:\/\//.test(content)) {
        failures.push(`${relative(root, path)} contains an external resource URL.`);
      }
    }
  }
}
await inspect(resolve(root, "src"));
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
for (const name of ["next", "react", "react-dom", "@playwright/test"]) {
  if (name in dependencies) failures.push(`Remove the web interface dependency: ${name}`);
}
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)(private-data|uploads|reports|local|\.avalon|\.env[^/]*)\b|\.(jsonl|ndjson|csv|parquet|arrow|h5|hdf5|pem|key|p12|sqlite|db)$/i.test(file)) {
    failures.push(`Remove the private data path from Git: ${file}`);
  }
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Privacy source check passes. No network or browser APIs. Process execution is restricted to the declared trial adapter. No tracked private data files.\n");
}
