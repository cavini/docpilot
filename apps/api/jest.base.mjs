/**
 * Settings every Jest project in this app shares.
 *
 * Plain ESM rather than TypeScript because Jest's config loader cannot import
 * one TypeScript config from another, so a shared base has to be a module Node
 * can load directly.
 *
 * SWC compiles the tests rather than ts-jest: it is far faster and handles the
 * legacy decorators and `emitDecoratorMetadata` that Nest's injection relies
 * on. The decorator settings live in `.swcrc`, so the compiler behaves the
 * same here and in a build.
 *
 * @type {import('jest').Config}
 */
export const base = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  moduleNameMapper: {
    // `nodenext` resolution wants extension-ful relative specifiers, which is
    // what the emitted JavaScript needs. Jest resolves them against the
    // TypeScript sources instead.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  clearMocks: true,
  restoreMocks: true,
};

/**
 * Settings shared by every suite that needs real Postgres, Redis and S3.
 *
 * Containers start once for the whole run, so the workers are limited to one:
 * they share the same database and would otherwise race on its contents.
 *
 * @type {import('jest').Config}
 */
export const withContainers = {
  ...base,
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  testTimeout: 60_000,
  maxWorkers: 1,
};
