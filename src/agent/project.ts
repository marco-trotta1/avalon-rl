import { z } from "zod";
import { digest, fingerprint, inspectPath, readBytes, readJson, writeJson } from "./io.js";

export const fingerprintSchema = z.strictObject({
  path: z.string().min(1).max(4096), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(),
});
export type Fingerprint = z.infer<typeof fingerprintSchema>;

const candidates = [
  "package.json", "package-lock.json", "pyproject.toml", "requirements.txt", "requirements-tested.txt",
  "python/pyproject.toml", "python/requirements-tested.txt", "uv.lock", "poetry.lock",
  "train.py", "trainer.py", "reward.py", "environment.py", "env.py", "src/train.py", "src/trainer.py", "src/reward.py", "src/environment.py",
] as const;
const frameworkNames = ["gymnasium", "numpy", "jax", "torch", "transformers", "trl", "ray", "stable-baselines3", "tensordict"] as const;
const packageSchema = z.object({
  dependencies: z.record(z.string(), z.unknown()).optional(), devDependencies: z.record(z.string(), z.unknown()).optional(),
  scripts: z.record(z.string(), z.unknown()).optional(),
});

export const profileSchema = z.strictObject({
  format: z.literal("avalon-agent-project-v1"), projectId: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(), discoveredFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  authorization: z.literal("inherit-host"),
});
export type ProjectProfile = z.infer<typeof profileSchema>;

export async function discoverProject(root: string) {
  const metadata: Fingerprint[] = [];
  const frameworks = new Set<string>();
  const scripts: string[] = [];
  for (const path of candidates) {
    if (!(await inspectPath(root, path)).exists) continue;
    metadata.push(await fingerprint(root, path));
    if (path === "package.json") {
      const parsed = packageSchema.safeParse(await readJson(root, path));
      if (!parsed.success) throw new Error("The project package metadata is invalid.");
      const names = Object.keys({ ...parsed.data.dependencies, ...parsed.data.devDependencies });
      for (const name of frameworkNames) if (names.includes(name)) frameworks.add(name);
      scripts.push(...Object.keys(parsed.data.scripts ?? {}).slice(0, 100));
    } else if (/\.toml$|requirements[^/]*\.txt$/.test(path)) {
      const text = (await readBytes(root, path)).toString("utf8");
      for (const name of frameworkNames) if (new RegExp(`(?:^|[\\s"'])${name}(?:[\\s"'\\[<>=!~]|$)`, "m").test(text)) frameworks.add(name);
    }
  }
  metadata.sort((left, right) => left.path.localeCompare(right.path));
  return {
    format: "avalon-agent-discovery-v1" as const,
    projectId: digest(root), metadata,
    fingerprint: digest(JSON.stringify(metadata)),
    declaredFrameworks: [...frameworks].sort(), scripts: scripts.sort(),
    bundledCapabilities: ["snapshot-audit", "operations-world", "trace-contract", "sampling-receipts", "finite-policy-experiments", "gymnasium-reinforce", "hoeffding-selection", "saved-run-inspection"],
    runtimeVerification: "Dependency declarations do not establish an installed or working trainer. Execute the selected adapter's smoke check.",
    scope: "Discovery checks named project metadata and conventional trainer files. Declare other relevant files with start --input.",
    authorization: "inherit-host" as const,
  };
}

export async function initProjectUnlocked(root: string): Promise<{ status: "created" | "existing"; profile: ProjectProfile }> {
  const path = ".avalon/project.json";
  const discovery = await discoverProject(root);
  if ((await inspectPath(root, path)).exists) {
    const parsed = profileSchema.safeParse(await readJson(root, path));
    if (!parsed.success || parsed.data.projectId !== discovery.projectId) throw new Error("The project profile is invalid or belongs to another directory.");
    return { status: "existing", profile: parsed.data };
  }
  const profile: ProjectProfile = {
    format: "avalon-agent-project-v1", projectId: discovery.projectId, createdAt: new Date().toISOString(),
    discoveredFingerprint: discovery.fingerprint, authorization: "inherit-host",
  };
  await writeJson(root, path, profile);
  return { status: "created", profile };
}
