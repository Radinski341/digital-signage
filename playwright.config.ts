import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_START_SERVER
    ? {
        command: "npm run start -- --port 3100",
        url: "http://localhost:3100/api/health",
        reuseExistingServer: false,
        timeout: 60000,
      }
    : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
});
