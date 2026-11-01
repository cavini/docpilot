import { z } from 'zod';

import { VERSION } from '../version.js';

import { EMBEDDING_DIMENSIONS } from '../db/schema/index.js';

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
    // `silent` is a real pino level and is what the test suites use, so that
    // a failing test's output is its own assertion rather than a wall of logs.
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

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

    // Defaults to the most capable model. A public demo may well want a
    // cheaper one; docs/costs.md compares them.
    CHAT_MODEL: z.string().default('claude-opus-5'),

    // Separate from LLM_PROVIDER on purpose: Anthropic publishes no
    // first-party embeddings API, so the provider that answers questions and
    // the one that embeds are independent choices.
    EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    EMBEDDING_DIMENSIONS: integerFromString(EMBEDDING_DIMENSIONS),

    // Chunking. Measured against the evals in M7; starting values for now.
    CHUNK_SIZE_TOKENS: integerFromString(500),
    CHUNK_OVERLAP_TOKENS: z.coerce.number().int().nonnegative().default(75),

    // Retrieval.
    RETRIEVAL_TOP_K: integerFromString(8),
    CACHE_TTL_SECONDS: integerFromString(3600),
    MAX_QUESTION_LENGTH: integerFromString(1000),
    MAX_OUTPUT_TOKENS: integerFromString(1024),

    /**
     * How many model calls one agent turn may make.
     *
     * A model that keeps calling tools - because one keeps failing, or because
     * it has misunderstood - costs money on every step and would otherwise run
     * until the request times out. Six is enough for search, read, extract and
     * answer, with room for one mistake.
     */
    AGENT_MAX_STEPS: integerFromString(6),

    // Ingestion limits.
    MAX_UPLOAD_MB: integerFromString(20),

    /**
     * How many documents the corpus may hold.
     *
     * One enormous file is covered by `MAX_UPLOAD_MB`; this covers a thousand
     * small ones, which costs the same in embeddings and storage and is the
     * easier of the two to do by accident.
     *
     * Zero means no limit, which is the right default for a local corpus I
     * control and the wrong one for a public URL.
     */
    MAX_DOCUMENTS: integerFromString(0),

    // Feature flags. These are defaults; rows in `feature_flags` override them.
    FF_RERANK: booleanFromString(false),
    FF_GRAPHQL: booleanFromString(true),
    FF_AGENT_TOOLS: booleanFromString(true),
    FF_PUBLIC_UPLOADS: booleanFromString(true),

    // Demo protection. Empty means the API is open, which is the local default.
    DEMO_API_KEY: z.string().default(''),

    /**
     * A ceiling on what a UTC day of model calls may cost, in US dollars.
     *
     * The measure that actually protects a hosted demo's provider balance. A
     * request-count limit does not: one agent turn can be six model calls and
     * a cached search can be none, so a limit counted in requests has no
     * dollars in it.
     *
     * Read from `llm_usage`, which already records the cost of every call.
     *
     * Zero means no ceiling. That is the local default, where every call goes
     * to the mock provider and costs nothing.
     */
    DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(0),

    // Tracing. Off unless an agent is actually available.
    DD_TRACE_ENABLED: booleanFromString(false),
    DD_SERVICE: z.string().default('docpilot-api'),
    DD_ENV: z.string().default('local'),
    DD_VERSION: z.string().default(VERSION),
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

    // The vector column has a declared width and an index built for it, so a
    // mismatch would fail on the first insert rather than at startup.
    if (env.EMBEDDING_DIMENSIONS !== EMBEDDING_DIMENSIONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMBEDDING_DIMENSIONS'],
        message:
          `EMBEDDING_DIMENSIONS must be ${String(EMBEDDING_DIMENSIONS)} to match the database ` +
          'column. Changing it means a migration and re-embedding the whole corpus.',
      });
    }

    if (env.CHUNK_OVERLAP_TOKENS >= env.CHUNK_SIZE_TOKENS) {
      ctx.addIssue({
        code: 'custom',
        path: ['CHUNK_OVERLAP_TOKENS'],
        message:
          'CHUNK_OVERLAP_TOKENS must be smaller than CHUNK_SIZE_TOKENS, or every chunk would ' +
          'repeat the whole of the one before it.',
      });
    }

    if (env.EMBEDDING_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when EMBEDDING_PROVIDER is "openai"',
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
