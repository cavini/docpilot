import { defineConfig, devices } from '@playwright/test';

/** Where the application under test is served. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

/**
 * Browser end-to-end tests.
 *
 * These drive complete journeys through the real application: routing,
 * locale negotiation, streaming and uploads. Single components are covered by
 * Cypress Component Testing instead, so the two suites do not overlap.
 *
 * The API is stubbed at the network layer rather than started, so this suite
 * needs no database, no Redis and no API key. Journeys that genuinely need the
 * backend will start it with the mock language model.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    // Kept on first retry only: enough to debug a CI failure without storing a
    // trace for every passing run.
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Built output rather than the dev server: it is what gets deployed, and
    // it does not recompile mid-test.
    command: 'pnpm run build && pnpm exec next start --port 3100',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
