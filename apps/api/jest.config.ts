import type { Config } from 'jest';

/**
 * Unit test configuration for the API.
 *
 * SWC compiles the tests rather than ts-jest: it is an order of magnitude
 * faster and handles the legacy decorators and `emitDecoratorMetadata` that
 * Nest's dependency injection relies on. Decorator settings live in `.swcrc`
 * so the compiler behaves the same here and in a build.
 */
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  moduleNameMapper: {
    // `nodenext` resolution wants extension-ful relative specifiers, which is
    // what the emitted JavaScript needs. Jest resolves them against the
    // TypeScript sources instead.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/worker.ts'],
  coverageDirectory: 'coverage',
  clearMocks: true,
  restoreMocks: true,
};

export default config;
