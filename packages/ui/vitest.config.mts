import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Two test projects over the same components.
 *
 * `unit` runs the plain React Testing Library specs in jsdom: fast, and enough
 * for behaviour that does not depend on real layout or styling.
 *
 * `storybook` runs each story's `play` function in a real Chromium through
 * Playwright, which is what catches the things jsdom cannot see: focus
 * handling, real CSS, and the accessibility checks the a11y addon runs.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.{test,stories}.{ts,tsx}', 'src/test-setup.ts', 'src/index.ts'],
            thresholds: { lines: 70 },
          },
        },
      },
      {
        plugins: [react(), tailwindcss(), storybookTest({ configDir: '.storybook' })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
