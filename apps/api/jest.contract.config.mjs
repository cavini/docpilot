import { withContainers } from './jest.base.mjs';

/**
 * Contract tests: every response matches the committed `openapi.json`.
 *
 * A separate suite from end-to-end because it answers a different question. An
 * e2e test asks whether the endpoint does the right thing; a contract test
 * asks whether it returns what the published schema promises, which is what
 * the generated clients and the MCP server depend on.
 *
 * @type {import('jest').Config}
 */
export default {
  ...withContainers,
  testMatch: ['<rootDir>/test/contract/**/*.spec.ts'],
};
