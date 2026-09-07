import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}/fitness-blog/`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: `JEKYLL_ENV=production bundle exec jekyll serve --host 127.0.0.1 --port ${port} --baseurl /fitness-blog --destination ${process.env.TMPDIR || "/tmp"}/fitness-blog-e2e`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
