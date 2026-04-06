import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from repo root.
config({ path: resolve(__dirname, "../../../.env") });

/**
 * Playwright config for Dust E2E API tests.
 *
 * These tests exercise the public v1 API against a running Dust instance.
 * Reads credentials from .env at the repo root:
 *   - DUST_DEVELOPMENT_SYSTEM_API_KEY
 *   - DUST_DEVELOPMENT_WORKSPACE_ID
 *
 * Run from repo root:
 *   npx playwright test --config front/tests/e2e/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 180_000, // 3 minutes — agent responses can be slow
  retries: 0,
  workers: 1, // Sequential — we're hitting a live server
  reporter: [["list"]],
  use: {
    baseURL: process.env.DUST_API_URL ?? "http://localhost:3000",
  },
});
