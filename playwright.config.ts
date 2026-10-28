import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4317", browserName: "chromium" },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
