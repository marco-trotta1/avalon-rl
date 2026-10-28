import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { demoCase, demoData } from "../src/lib/demo";

test("trace appraisal, evidence review, report export, and session clearing", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", error => consoleErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A price you can trace." })).toBeVisible();
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator(".main-price")).toHaveText("$15,000");
  await expect(page.getByText("Synthetic demonstration", { exact: true })).toBeVisible();
  await expect(page.getByText("260 source records", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deal evidence" }).click();
  await expect(page.getByRole("cell", { name: "Synthetic deal 1" })).toBeVisible();
  await expect(page.getByText("25.0%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Appraisal", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download private report" }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error("The report download is absent.");
  const content = await readFile(path, "utf8");
  const report = JSON.parse(content) as { format: string; estimate: { medianUsd: number; mode: string } };
  expect(report.format).toBe("traceatlas-aggregate-v1");
  expect(report.estimate.medianUsd).toBeCloseTo(15_000, 6);
  expect(report.estimate.mode).toBe("synthetic");
  expect(content).not.toContain('"observations":');
  expect(content).not.toContain("Synthetic deal");
  expect(requests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.getByRole("button", { name: "Clear session", exact: true }).click();
  await expect(page.locator(".main-price")).toHaveCount(0);
  await expect(page.getByText("No asset loaded", { exact: true })).toBeVisible();
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(storage).toEqual({ local: 0, session: 0 });
});

test("imports actual-format private inputs without network requests or payload export", async ({ page }) => {
  await page.goto("/");
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  const appraisal = demoCase("traces");
  const input = { ...appraisal, evidenceMode: "user-supplied", asset: { ...appraisal.asset, name: "Private local fixture" } };
  await page.getByLabel("Import appraisal JSON").setInputFiles({
    name: "private-appraisal.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(page.getByText("Private local fixture", { exact: true })).toBeVisible();
  await page.getByLabel("Import asset data").setInputFiles({
    name: "private-traces.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(demoData("traces")),
  });
  await expect(page.locator(".main-price")).toHaveText("$15,000");
  await expect(page.getByText("Provisional estimate", { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.reload();
  await expect(page.getByText("Private local fixture", { exact: true })).toHaveCount(0);
  await expect(page.locator(".main-price")).toHaveCount(0);
});

test("environment mode analyzes task manifests and states the execution boundary", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "RL environment", exact: true }).click();
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator(".main-price")).toHaveText("$13,200");
  await expect(page.getByText("12 source records", { exact: true })).toBeVisible();
  await expect(page.getByText("Static inspection only. Environment code does not run.", { exact: true })).toBeVisible();
});

test("ownership sale uses matching sale transactions and displays sale terms", async ({ page }) => {
  await page.goto("/");
  const original = demoCase("traces");
  const rights = { type: "assignment" } as const;
  const appraisal = {
    ...original, asset: { ...original.asset, rights },
    comparables: original.comparables.map(deal => ({ ...deal, rights })),
  };
  await page.getByLabel("Import appraisal JSON").setInputFiles({
    name: "synthetic-sale.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(appraisal)),
  });
  await page.getByLabel("Import asset data").setInputFiles({
    name: "synthetic-traces.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(demoData("traces")),
  });
  await expect(page.locator(".main-price")).toHaveText("$15,000");
  await expect(page.getByText("Full ownership sale", { exact: true })).toBeVisible();
  await expect(page.locator(".price-caption")).toContainText("Estimated sale price");
});

test("missing transaction evidence withholds the price", async ({ page }) => {
  await page.goto("/");
  const original = demoCase("traces");
  await page.getByLabel("Import appraisal JSON").setInputFiles({
    name: "no-deals.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...original, evidenceMode: "user-supplied", comparables: [] })),
  });
  await page.getByLabel("Import asset data").setInputFiles({
    name: "traces.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(demoData("traces")),
  });
  await expect(page.getByText("The evidence does not support a price yet.", { exact: true })).toBeVisible();
  await expect(page.locator(".main-price")).toHaveCount(0);
  await expect(page.getByText(/Supply at least 3 matching transactions/)).toBeVisible();
});

test("production policy blocks exfiltration and rejects uploads and foreign hosts", async ({ page, request }) => {
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"];
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("form-action 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  const icon = await request.get("/icon.svg");
  expect(icon.status()).toBe(200);
  const requests: string[] = [];
  page.on("request", item => requests.push(item.url()));
  const blocked = await page.evaluate(async () => {
    try { await fetch("https://example.com/private-test", { method: "POST", body: "synthetic-only" }); return false; }
    catch { return true; }
  });
  expect(blocked).toBe(true);
  expect(requests).toEqual([]);
  const upload = await request.post("/", { data: "synthetic" });
  expect(upload.status()).toBe(405);
  const host = await request.get("/", { headers: { Host: "untrusted.example" } });
  expect(host.status()).toBe(403);
});

test("mobile layout keeps controls reachable and has no page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator(".main-price")).toHaveText("$15,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The browser does the work." })).toBeVisible();
  await page.getByRole("button", { name: "Method", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download blank template" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
