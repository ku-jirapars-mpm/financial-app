import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build using E2E_DATABASE_URL (a disposable database).

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } }],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123",
      BETTER_AUTH_URL: "http://localhost:3100",
      ALLOW_SIGNUP: "true",
    },
  },
});
