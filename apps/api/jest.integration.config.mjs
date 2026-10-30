import { withContainers } from './jest.base.mjs';

/**
 * Integration tests: Nest modules against real Postgres, Redis and S3.
 *
 * Real containers rather than fakes, because what is worth testing here is
 * exactly what a fake would not reproduce: that the pgvector extension exists,
 * that an index is actually used, that the AWS SDK's signing is accepted.
 *
 * @type {import('jest').Config}
 */
export default {
  ...withContainers,
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
};
