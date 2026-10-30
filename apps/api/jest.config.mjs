import { base } from './jest.base.mjs';

/**
 * Unit tests: pure functions and services with their dependencies substituted.
 * No containers, so this is the suite that runs on every save.
 *
 * Coverage is collected only from code that makes decisions. Modules, tokens,
 * DTOs and bootstraps are declarative: they list providers or describe a shape,
 * and a percentage over them measures nothing while diluting the number that
 * does mean something.
 *
 * @type {import('jest').Config}
 */
export default {
  ...base,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/export-openapi.ts',
    '!src/swagger.ts',
    '!src/**/*.module.ts',
    '!src/**/*.tokens.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.response.ts',
    '!src/db/database.type.ts',
    '!src/db/schema/**',
  ],
  coverageDirectory: 'coverage',

  // V8's native coverage rather than Jest's default Babel instrumentation.
  // Babel counts the branches SWC emits for decorators and parameter
  // injection, which no test can reach, so a fully exercised Nest service
  // scored around 42% branches while an undecorated module next to it scored
  // 100%. V8 measures the code as it runs, which makes the number mean
  // something, and it matches the provider the Vitest suites use.
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 75,
    },
  },
};
