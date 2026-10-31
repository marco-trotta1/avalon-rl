import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("reproducible CI runtimes", () => {
  it("pins runner images instead of inheriting a moving latest label", () => {
    const directory = ".github/workflows";
    const labels = readdirSync(directory).filter(name => /\.ya?ml$/.test(name)).flatMap(name =>
      [...readFileSync(join(directory, name), "utf8").matchAll(/^\s+runs-on:\s*(\S+)\s*$/gm)].map(match => match[1]),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toMatch(/^ubuntu-\d{2}\.\d{2}$/);
  });
});
