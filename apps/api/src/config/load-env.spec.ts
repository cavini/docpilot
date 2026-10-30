import { EnvValidationError, loadEnv } from './load-env.js';

/** The smallest environment that satisfies the schema. */
const minimalEnv = {
  DATABASE_URL: 'postgres://docpilot:docpilot@localhost:5432/docpilot',
  REDIS_URL: 'redis://localhost:6379',
} satisfies NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('AC1: accepts an environment with only the required variables set', () => {
    expect(() => loadEnv(minimalEnv)).not.toThrow();
  });

  it('AC2: applies documented defaults so local development needs no tuning', () => {
    const env = loadEnv(minimalEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.WORKER_MODE).toBe('inline');
    expect(env.STORAGE_DRIVER).toBe('s3');
    expect(env.LLM_PROVIDER).toBe('mock');
    expect(env.DD_TRACE_ENABLED).toBe(false);
  });

  it('AC3: coerces numeric variables to numbers', () => {
    const env = loadEnv({ ...minimalEnv, API_PORT: '8080', WORKER_CONCURRENCY: '4' });

    expect(env.API_PORT).toBe(8080);
    expect(env.WORKER_CONCURRENCY).toBe(4);
  });

  it('AC4: parses booleans from the strings environment variables carry', () => {
    const env = loadEnv({ ...minimalEnv, DD_TRACE_ENABLED: 'true', FF_RERANK: 'false' });

    expect(env.DD_TRACE_ENABLED).toBe(true);
    expect(env.FF_RERANK).toBe(false);
  });

  it('AC5: rejects a missing required variable', () => {
    expect(() => loadEnv({ REDIS_URL: 'redis://localhost:6379' })).toThrow(EnvValidationError);
  });

  it('AC6: names every missing variable in one error, not just the first', () => {
    let error: EnvValidationError | undefined;

    try {
      loadEnv({});
    } catch (caught) {
      error = caught as EnvValidationError;
    }

    expect(error).toBeInstanceOf(EnvValidationError);
    expect(error?.problems).toHaveLength(2);
    expect(error?.message).toContain('DATABASE_URL');
    expect(error?.message).toContain('REDIS_URL');
  });

  it('AC7: rejects a value outside an enumerated set', () => {
    expect(() => loadEnv({ ...minimalEnv, WORKER_MODE: 'sometimes' })).toThrow(EnvValidationError);
  });

  it('AC8: rejects a non numeric port', () => {
    expect(() => loadEnv({ ...minimalEnv, API_PORT: 'http' })).toThrow(EnvValidationError);
  });

  it('AC9: rejects a boolean variable that is neither true nor false', () => {
    expect(() => loadEnv({ ...minimalEnv, DD_TRACE_ENABLED: 'yes' })).toThrow(EnvValidationError);
  });

  it('AC10: requires the openai key when openai is the selected provider', () => {
    expect(() => loadEnv({ ...minimalEnv, LLM_PROVIDER: 'openai' })).toThrow(
      /OPENAI_API_KEY is required/,
    );
  });

  it('AC11: requires the anthropic key when anthropic is the selected provider', () => {
    expect(() => loadEnv({ ...minimalEnv, LLM_PROVIDER: 'anthropic' })).toThrow(
      /ANTHROPIC_API_KEY is required/,
    );
  });

  it('AC12: accepts a provider whose key is present', () => {
    const env = loadEnv({ ...minimalEnv, LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' });

    expect(env.LLM_PROVIDER).toBe('openai');
  });

  it('AC13: needs no provider key when the mock provider is selected', () => {
    expect(() => loadEnv({ ...minimalEnv, LLM_PROVIDER: 'mock' })).not.toThrow();
  });

  it('AC14: points the reader at .env.example rather than at the schema', () => {
    expect(() => loadEnv({})).toThrow(/\.env\.example/);
  });

  it('AC15: never includes a secret value in the error message', () => {
    let message = '';

    try {
      loadEnv({ ...minimalEnv, LLM_PROVIDER: 'anthropic', OPENAI_API_KEY: 'sk-leak-me' });
    } catch (caught) {
      message = (caught as Error).message;
    }

    expect(message).not.toContain('sk-leak-me');
  });
});
