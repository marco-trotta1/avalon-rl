import { describe, expect, it } from "vitest";
import { demoFailureCase, failureCaseHash, parseFailureCase } from "../src/failure/case.js";

describe("failure capture", () => {
  it("preserves the observed failure and its private provenance", () => {
    const failure = demoFailureCase();
    expect(failure.rights.status).toBe("private");
    expect(failure.provenance.source).toBe("synthetic");
    expect(failure.files.observed["config.json"]).not.toBe(failure.files.initial["config.json"]);
    expect(failure.files.reference["config.json"]).toBe(failure.files.initial["config.json"]);
    expect(parseFailureCase(JSON.parse(JSON.stringify(failure)))).toEqual(failure);
  });

  it.each(["../secret", "/secret", "a\\b", "a/../b", "a//b", "a/", "a:b", "constructor", "__proto__/x", "NUL.txt", "a."])(
    "rejects the unsafe path %s", path => {
      const failure = demoFailureCase();
      expect(() => parseFailureCase({ ...failure, files: { ...failure.files, observed: { [path]: "value" } } })).toThrow();
    },
  );

  it("rejects ambiguous paths and file directory collisions", () => {
    const failure = demoFailureCase();
    for (const observed of [{ "a.txt": "a", "A.txt": "b" }, { a: "a", "a/b": "b" }, { a: "a", "A/b": "b" }]) {
      expect(() => parseFailureCase({ ...failure, files: { ...failure.files, observed } })).toThrow();
    }
  });

  it("accepts portable dotfiles", () => {
    const failure = demoFailureCase();
    const result = parseFailureCase({ ...failure, files: { ...failure.files, observed: { ".gitignore": "dist/\n" } } });
    expect(result.files.observed[".gitignore"]).toBe("dist/\n");
  });

  it("rejects missing initial evidence, duplicate checks, and empty checks", () => {
    const failure = demoFailureCase();
    for (const checks of [[], [...failure.checks, failure.checks[0]], [{ kind: "unchanged", path: "missing.txt" }]]) {
      expect(() => parseFailureCase({ ...failure, checks })).toThrow();
    }
  });

  it("requires explicit rights and rejects undeclared fields", () => {
    const failure = demoFailureCase();
    for (const rights of [undefined, { status: "authorized" }, { status: "private", owner: "somebody" }]) {
      expect(() => parseFailureCase({ ...failure, rights })).toThrow();
    }
    expect(() => parseFailureCase({ ...failure, execute: "a command" })).toThrow();
    expect(() => parseFailureCase({ ...failure, provenance: { ...failure.provenance, capturedAt: "yesterday" } })).toThrow();
  });

  it("rejects excess file count and snapshot bytes", () => {
    const failure = demoFailureCase();
    for (const observed of [
      Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`file-${i}`, ""])),
      Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`file-${i}`, "x".repeat(65_536)])),
      { file: "x".repeat(65_537) },
    ]) {
      expect(() => parseFailureCase({ ...failure, files: { ...failure.files, observed } })).toThrow();
    }
  });

  it("binds content and rights while ignoring object key insertion order", () => {
    const failure = demoFailureCase();
    const reordered = parseFailureCase({
      ...failure,
      files: Object.fromEntries(Object.entries(failure.files).reverse().map(([key, files]) =>
        [key, Object.fromEntries(Object.entries(files).reverse())])),
    });
    expect(failureCaseHash(reordered)).toBe(failureCaseHash(failure));
    const changed = parseFailureCase({ ...failure, title: "Another title" });
    expect(failureCaseHash(changed)).not.toBe(failureCaseHash(failure));
    const authorized = parseFailureCase({ ...failure, rights: {
      status: "authorized", owner: "Example owner", allowedUses: ["evaluation"], attestedAt: "2026-11-01T00:00:00Z",
    } });
    expect(failureCaseHash(authorized)).not.toBe(failureCaseHash(failure));
  });
});
