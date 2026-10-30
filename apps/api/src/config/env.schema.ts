import { z } from 'zod';

/** Parses the strings `true` and `false` that environment variables carry. */
const booleanFromString = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

/** Parses a positive integer from an environment variable. */
const integerFromString = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

/**
 * Every environment variable the API reads, with its type, default and
 * constraints.
 *
 * Variables are added to this schema in the milestone that starts reading
 * them, so the schema, `.env.example` and the README table never describe
 * settings that no code honours.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Transport
    API_PORT: integerFromString(3001),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3000')
      .describe('Comma separated list of allowed web origins'),

    // Data stores
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').describe('Postgres connection URL'),
    REDIS_URL: z
      .string()
      .min(1, 'REDIS_URL is required')
      .describe('Redis connection URL, used for the queue, cache and rate limiting'),

    // Ingestion worker placement
    WORKER_MODE: z
      .enum(['inline', 'separate', 'off'])
      .default('inline')
      .describe('Where the BullMQ processors run'),
    WORKER_CONCURRENCY: integerFromString(2),

    // Document storage
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
    S3_BUCKET: z.string().default('docpilot-documents'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ENDPOINT: z
      .string()
      .default('http://localhost:4566')
      .describe('S3 endpoint; empty string targets real AWS'),
    S3_FORCE_PATH_STYLE: booleanFromString(true).describe('Required by S3 emulators'),
    AWS_ACCESS_KEY_ID: z.string().default('test'),
    AWS_SECRET_ACCESS_KEY: z.string().default('test'),
    LOCAL_STORAGE_DIR: z.string().default('./uploads'),

    // Language model provider. `mock` uses deterministic test models, so the
    // whole test suite runs with no keys and no cost.
    LLM_PROVIDER: z.enum(['openai', 'anthropic', 'mock']).default('mock'),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    // Feature flags. These are defaults; rows in `feature_flags` override them.
    FF_RERANK: booleanFromString(false),
    FF_GRAPHQL: booleanFromString(true),
    FF_AGENT_TOOLS: booleanFromString(true),
    FF_PUBLIC_UPLOADS: booleanFromString(true),

    // Demo protection. Empty means the API is open, which is the local default.
    DEMO_API_KEY: z.string().default(''),

    // Tracing. Off unless an agent is actually available.
    DD_TRACE_ENABLED: booleanFromString(false),
    DD_SERVICE: z.string().default('docpilot-api'),
    DD_ENV: z.string().default('local'),
    DD_VERSION: z.string().default('0.0.0'),
    DD_AGENT_HOST: z.string().default('localhost'),
  })
  .superRefine((env, ctx) => {
    // A provider without its key fails on the first request instead of at
    // startup, which is exactly the kind of failure this schema exists to
    // prevent.
    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when LLM_PROVIDER is "openai"',
      });
    }

    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER is "anthropic"',
      });
    }

    if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when STORAGE_DRIVER is "s3"',
      });
    }
  });

/** The validated, typed configuration the application runs on. */
export type Env = z.infer<typeof envSchema>;
