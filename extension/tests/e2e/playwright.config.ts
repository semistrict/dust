import { defineConfig } from "@playwright/test";
import { resolve } from "path";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: resolve(__dirname, "./setup/global.setup.ts"),
  use: {
    headless: true,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
