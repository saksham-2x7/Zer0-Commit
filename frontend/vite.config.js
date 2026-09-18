import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";

export default defineConfig({
  plugins: [
    react(),
    // Ship pre-compressed .gz + .br artifacts so the CDN/static host can
    // serve them without paying for on-the-fly compression.
    compression({ algorithm: "gzip" }),
    compression({ algorithm: "brotliCompress" }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    // e2e/ holds Playwright specs (run via `npx playwright test`, not
    // Vitest) — both use the *.spec.js naming convention, so without this
    // exclude Vitest tries to run Playwright's test.describe() through its
    // own runner and crashes.
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
