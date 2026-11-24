import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // One worker: the demo data layer is a single in-memory store, and some cases change shared seed data.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, args: ["--no-sandbox"] } : {},
  },
  webServer: {
    // Fresh demo data every run. Build first: npm run build
    command: `rm -rf .data && NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
