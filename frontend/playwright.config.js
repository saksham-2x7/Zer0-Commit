import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Cross-platform: inline `MOCK_BEDROCK=true cmd` shell syntax only
      // works on POSIX shells and fails on Windows cmd.exe (which is what
      // Node spawns commands through by default on Windows) — use
      // Playwright's own `env` option instead, which sets it via the
      // child_process env, not shell syntax.
      command: "npm run dev:api",
      cwd: "..",
      env: { MOCK_BEDROCK: "true" },
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
