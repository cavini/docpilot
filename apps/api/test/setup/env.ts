import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Must match the path in `global-setup.ts`; see the note there. */
const CONTAINER_INFO_PATH = join(tmpdir(), 'docpilot-test-containers.json');

interface ContainerInfo {
  databaseUrl: string;
  redisUrl: string;
  s3Endpoint: string;
  s3Bucket: string;
}

/**
 * Points the application's configuration at the test containers.
 *
 * Runs in every worker before the application is imported, so the config
 * module reads these values when it validates the environment.
 */
const info = JSON.parse(readFileSync(CONTAINER_INFO_PATH, 'utf8')) as ContainerInfo;

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = info.databaseUrl;
process.env.REDIS_URL = info.redisUrl;
process.env.S3_ENDPOINT = info.s3Endpoint;
process.env.S3_BUCKET = info.s3Bucket;
process.env.S3_FORCE_PATH_STYLE = 'true';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

// No queue processors during tests: a test that needs one starts it itself.
process.env.WORKER_MODE = 'off';

// Deterministic, free, and no key required.
process.env.LLM_PROVIDER = 'mock';

// Keep the output readable; a failing test says what went wrong itself.
process.env.LOG_LEVEL = 'silent';
