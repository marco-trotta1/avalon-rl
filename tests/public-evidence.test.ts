import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";

const publicArtifacts = z.object({ source_artifacts: z.array(z.object({
  id: z.string().min(1), artifact_name: z.string().regex(/^[^/\\:]+$/),
  bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()) });

describe("public research evidence", () => {
  it("publishes artifact names and hashes without local filesystem metadata", () => {
    const value = JSON.parse(readFileSync("docs/wave2/evidence.json", "utf8")) as unknown;
    const parsed = publicArtifacts.safeParse(value);
    expect(parsed.success).toBe(true);
  });
});
