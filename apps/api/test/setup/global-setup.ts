import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

/**
 * Where the container details are handed to the test workers.
 *
 * Jest's global setup runs in the main process while tests run in workers, and
 * environment variables set in one do not reliably reach the other. Writing
 * the details to a file and reading them in each worker's setup removes that
 * dependency.
 *
 * The path is repeated in `global-teardown.ts` and `env.ts` rather than
 * imported, because global setup files are loaded outside Jest's module
 * registry, so the path mapping that lets the rest of the suite use
 * extension-ful imports does not apply to them.
 */
const CONTAINER_INFO_PATH = join(tmpdir(), 'docpilot-test-containers.json');

/**
 * Images the tests run against.
 *
 * Pinned to the same versions as `docker-compose.yml`, so a passing test says
 * something about the version that actually runs. LocalStack is held at 4.14.0
 * because later releases refuse to start without a paid auth token, which
 * would make the suite unrunnable without an account.
 */
const IMAGES = {
  postgres: 'pgvector/pgvector:0.8.7-pg17',
  redis: 'redis:8.8-alpine',
  localstack: 'localstack/localstack:4.14.0',
} as const;

/** Bucket the storage tests use. */
const BUCKET = 'docpilot-test-documents';

interface StartedContainers {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  localstack: StartedLocalStackContainer;
}

declare global {
  // A `var` is how a value is shared between Jest's global setup and teardown.
  var __DOCPILOT_CONTAINERS__: StartedContainers | undefined;
}

/**
 * Starts Postgres, Redis and S3 once for the whole test run.
 *
 * Real containers rather than fakes, because what is worth testing here is
 * exactly what a fake would not reproduce: whether the pgvector extension
 * exists, whether an index is actually used, and whether the AWS SDK's request
 * signing is accepted. An in-memory substitute would pass while production
 * failed.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, redis, localstack] = await Promise.all([
    new PostgreSqlContainer(IMAGES.postgres)
      .withDatabase('docpilot_test')
      .withUsername('docpilot')
      .withPassword('docpilot')
      .start(),
    new RedisContainer(IMAGES.redis).start(),
    new LocalstackContainer(IMAGES.localstack).withEnvironment({ SERVICES: 's3' }).start(),
  ]);

  await localstack.exec(['awslocal', 's3', 'mb', `s3://${BUCKET}`]);

  globalThis.__DOCPILOT_CONTAINERS__ = { postgres, redis, localstack };

  writeFileSync(
    CONTAINER_INFO_PATH,
    JSON.stringify({
      databaseUrl: postgres.getConnectionUri(),
      redisUrl: redis.getConnectionUrl(),
      s3Endpoint: `http://${localstack.getHost()}:${String(localstack.getMappedPort(4566))}`,
      s3Bucket: BUCKET,
    }),
    'utf8',
  );
}
