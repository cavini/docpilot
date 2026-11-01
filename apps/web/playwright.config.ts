import { defineConfig, devices } from '@playwright/test';

/** Where the application under test is served. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

/**
 * Where the streaming stub answers.
 *
 * The built app is pointed here rather than at the real API's port, so a
 * running development server cannot change what the suite sees.
 */
const STUB_PORT = process.env.EXTRACT_STUB_PORT ?? '3199';
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;

/**
 * Browser end-to-end tests.
 *
 * These drive complete journeys through the real application: routing,
 * locale negotiation, streaming and uploads. Single components are covered by
 * Cypress Component Testing instead, so the two suites do not overlap.
 *
 * The API is stubbed at the network layer rather than started, so this suite
 * needs no database, no Redis and no API key. The one exception is the
 * extraction stream: interception can only answer with a whole body, and a
 * whole body cannot show rows arriving one at a time, so that endpoint is
 * served by a small real server instead.
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
  webServer: [
    {
      command: 'node e2e/support/extract-stub.mjs',
      url: `${STUB_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Built output rather than the dev server: it is what gets deployed, and
      // it does not recompile mid-test.
      command: 'pnpm run build && pnpm exec next start --port 3100',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Read at build time, because it is a `NEXT_PUBLIC_` value and is
      // inlined into the bundle. Specs that intercept by glob are unaffected.
      env: { NEXT_PUBLIC_API_URL: STUB_URL },
    },
  ],
});
