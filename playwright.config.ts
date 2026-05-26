import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * Playwright runs in Node OUTSIDE Next, which does not auto-load `.env` files.
 * The e2e global-setup + fixtures need the cloud-dev Supabase credentials (incl.
 * the service-role key) in `process.env`, so load them here: first `.env.local`
 * (the same file `npm run dev` reads), then an optional `.env.e2e` overlay that
 * can override anything for e2e runs (see e2e/README.md and .env.e2e.example).
 */
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({
  path: path.resolve(process.cwd(), ".env.e2e"),
  override: true,
  quiet: true,
});

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e/specs",
  // Provisions the seeded spec users + an onboarded owner household and captures
  // the owner's storageState before any spec runs.
  globalSetup: "./e2e/global-setup.ts",
  // Each spec owns its data (a per-test ephemeral user, or the seeded owner), so
  // specs are safe to run in parallel — kept modest to be gentle on shared cloud dev.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  // One retry as a safety net for Next dev's on-demand route compilation on a
  // cold server (global-setup warms the generate route, but keep the net for CI).
  retries: process.env.CI ? 2 : 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    // Locally reuse a dev server you already have running; in CI always boot a
    // fresh one. The child inherits this process's env (dotenv-loaded above).
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
