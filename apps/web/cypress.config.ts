import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'cypress';
import { resolve } from 'node:path';

/**
 * Cypress Component Testing.
 *
 * Mounts single components in a real browser, which is where things jsdom
 * cannot model show up: real layout, real focus behaviour, real scrolling.
 * It complements Playwright rather than overlapping with it. The split is
 * deliberate and enforced by convention: no whole user journeys here, and no
 * isolated components in Playwright.
 *
 * Vite is the bundler rather than Next's, because a component test does not
 * need the framework's routing or server rendering, and a plain React build is
 * faster and far simpler to keep working across Next versions.
 */
export default defineConfig({
  video: false,
  screenshotOnRunFailure: false,
  component: {
    specPattern: 'cypress/component/**/*.cy.{ts,tsx}',
    supportFile: 'cypress/support/component.tsx',
    indexHtmlFile: 'cypress/support/component-index.html',
    devServer: {
      framework: 'react',
      bundler: 'vite',
      viteConfig: {
        plugins: [react(), tailwindcss()],
        resolve: {
          alias: { '@': resolve(import.meta.dirname, 'src') },
        },
        define: {
          // Next inlines this at build time. Vite does not define `process` in
          // the browser at all, so the same replacement is done here, which
          // also keeps the component code free of bundler-specific guards.
          'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(
            process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
          ),
        },
      },
    },
  },
});
