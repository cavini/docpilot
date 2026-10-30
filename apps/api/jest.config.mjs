import { base } from './jest.base.mjs';

/**
 * Unit tests: pure functions and services with their dependencies substituted.
 * No containers, so this is the suite that runs on every save.
 *
 * @type {import('jest').Config}
 */
export default {
  ...base,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/worker.ts'],
  coverageDirectory: 'coverage',
};
