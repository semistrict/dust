import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Lightweight Vitest config for pure unit tests that don't need a database.
 * Skips globalSetup (DB migrations) and setupFiles (Redis mocks).
 *
 * Usage:
 *   npx vitest run --config vite.unit.config.mjs lib/api/llm/...
 */
export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@app": path.resolve(import.meta.dirname, "./"),
    },
  },
});
