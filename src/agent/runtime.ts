import { createRequire } from "node:module";
import { dirname } from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { collectBundle, pendingBundle, writeBundle, type BundleFile } from "./bundle.js";
import { readBytes, readJson } from "./io.js";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const metadataSchema = z.object({
  name: z.literal("avalon-rl"), version: z.string().regex(/^\d+\.\d+\.\d+$/),
  dependencies: z.strictObject({ zod: z.string().regex(/^\d+\.\d+\.\d+$/) }),
});

export async function prepareRuntime() {
  const metadata = metadataSchema.parse(await readJson(packageRoot, "package.json"));
  const directory = `.avalon/runtime/${metadata.version}`;
  const files: BundleFile[] = [
    { source: "package.json", target: `${directory}/package.json`, bytes: Buffer.from(JSON.stringify({
      name: metadata.name, version: metadata.version, type: "module", license: "MIT", dependencies: metadata.dependencies,
    }, null, 2) + "\n") },
    { source: "LICENSE", target: `${directory}/LICENSE`, bytes: await readBytes(packageRoot, "LICENSE") },
  ];
  files.push(...await collectBundle({ root: packageRoot, source: "dist", target: `${directory}/dist`, accept: name => name.endsWith(".js") }));
  if (!files.some(file => file.target === `${directory}/dist/cli.js`)) throw new Error("Build the Avalon runtime before installation.");
  files.push(...await collectBundle({ root: packageRoot, source: "skills", target: `${directory}/skills`, accept: () => true }));
  const dependencyRoot = await realpath(dirname(createRequire(import.meta.url).resolve("zod/package.json")));
  z.object({ name: z.literal("zod"), version: z.literal(metadata.dependencies.zod) }).parse(await readJson(dependencyRoot, "package.json"));
  files.push(...await collectBundle({
    root: dependencyRoot, source: "v4", target: `${directory}/node_modules/zod/v4`, accept: name => name.endsWith(".js") || name === "package.json",
  }));
  for (const name of ["package.json", "index.js", "LICENSE"]) {
    files.push({ source: `zod/${name}`, target: `${directory}/node_modules/zod/${name}`, bytes: await readBytes(dependencyRoot, name) });
  }
  return { files, reference: { version: metadata.version, entrypoint: `${directory}/dist/cli.js`, directory } };
}

export async function installRuntime(input: { root: string; dryRun: boolean }) {
  const runtime = await prepareRuntime();
  const pending = await pendingBundle({ root: input.root, files: runtime.files });
  if (!input.dryRun) await writeBundle({ root: input.root, files: pending });
  return {
    format: "avalon-agent-runtime-install-v1", status: input.dryRun ? "planned" : pending.length ? "installed" : "unchanged",
    dryRun: input.dryRun, runtime: { ...runtime.reference, files: runtime.files.length, newFiles: pending.length },
    next: "Use node with the local runtime entrypoint. No global installation is required.",
  };
}
