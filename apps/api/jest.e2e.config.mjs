import { withContainers } from './jest.base.mjs';

/**
 * API end-to-end tests: the whole Nest application over HTTP through Supertest.
 *
 * These go through the real router, pipes, guards and exception filter, so
 * they catch wiring mistakes a unit test cannot see: a filter that was never
 * registered, a pipe that strips a field, a status set in the wrong place.
 *
 * @type {import('jest').Config}
 */
export default {
  ...withContainers,
  testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'],
};
