import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
describe("published SDK", () => {
  it("imports without starting a CLI and audits world experience", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const sdk = await import(${JSON.stringify(entry)});
      const source = sdk.makeWorldSnapshot({seed:7});
      const target = sdk.parseSnapshot({...source,stage:'recorded'});
      const report = sdk.auditSnapshots({source,target});
      process.stdout.write(JSON.stringify({status:report.status,episodes:source.episodes.length}));
    `], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "pass", episodes: 20 });
  });
});
