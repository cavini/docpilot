import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // Route components and the locale proxy are framework wiring, covered
        // by the Playwright journeys rather than in isolation.
        'src/app/**',
        'src/proxy.ts',
        'src/i18n/**',
        // Typed re-exports of react-redux's hooks; no behaviour of their own.
        'src/store/hooks.ts',
      ],
      thresholds: { lines: 70 },
    },
  },
});
