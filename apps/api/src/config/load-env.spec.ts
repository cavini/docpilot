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

  describe('when a spend ceiling is set', () => {
    const withBudget = {
      ...minimalEnv,
      DAILY_BUDGET_USD: '0.50',
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
      EMBEDDING_PROVIDER: 'openai',
    } satisfies NodeJS.ProcessEnv;

    it('refuses to start when the chat model has no price', () => {
      // The ceiling sums a cost column. A model with no price records zero,
      // so every call looks free and the ceiling never fires - which is the
      // money protection silently off, the worst of the three outcomes.
      expect(() => loadEnv({ ...withBudget, CHAT_MODEL: 'gpt-6-unreleased' })).toThrow(
        /no price in llm\/pricing\.ts/,
      );
    });

    it('names the model and says how to fix it', () => {
      expect(() => loadEnv({ ...withBudget, CHAT_MODEL: 'gpt-6-unreleased' })).toThrow(
        /gpt-6-unreleased[\s\S]*Add it there, or unset DAILY_BUDGET_USD/,
      );
    });

    it('refuses to start when the embedding model has no price', () => {
      expect(() =>
        loadEnv({ ...withBudget, CHAT_MODEL: 'gpt-5-mini', EMBEDDING_MODEL: 'text-embedding-9' }),
      ).toThrow(/text-embedding-9/);
    });

    it('accepts a model this build knows the price of', () => {
      expect(() => loadEnv({ ...withBudget, CHAT_MODEL: 'gpt-5-mini' })).not.toThrow();
      expect(() => loadEnv({ ...withBudget, CHAT_MODEL: 'gpt-5' })).not.toThrow();
    });

    it('does not care about prices when the provider is the mock', () => {
      // Nothing is spent, so nothing needs pricing.
      expect(() =>
        loadEnv({ ...minimalEnv, DAILY_BUDGET_USD: '0.50', CHAT_MODEL: 'whatever' }),
      ).not.toThrow();
    });

    it('does not care about prices when there is no ceiling to enforce', () => {
      expect(() =>
        loadEnv({
          ...minimalEnv,
          LLM_PROVIDER: 'openai',
          OPENAI_API_KEY: 'sk-test',
          CHAT_MODEL: 'gpt-6-unreleased',
        }),
      ).not.toThrow();
    });
  });

  describe('the demo key', () => {
    it('accepts an empty one, which leaves the API open locally', () => {
      expect(() => loadEnv({ ...minimalEnv, DEMO_API_KEY: '' })).not.toThrow();
    });

    it('refuses one short enough to guess', () => {
      // Worse than none: it reads as protection while being guessable, and
      // the failed-attempt limiter only slows a search down.
      expect(() => loadEnv({ ...minimalEnv, DEMO_API_KEY: 'docpilot2026' })).toThrow(
        /at least 24 characters/,
      );
    });

    it('says how to generate a good one rather than just refusing', () => {
      expect(() => loadEnv({ ...minimalEnv, DEMO_API_KEY: 'short' })).toThrow(/openssl rand -hex/);
    });

    it('accepts one worth having', () => {
      expect(() =>
        loadEnv({ ...minimalEnv, DEMO_API_KEY: 'f3a9c0e1b2d4e5f8a901c2d3e4f5a6b7c8d9e0f1' }),
      ).not.toThrow();
    });

    it('AC7: never puts the key in the error when it refuses one', () => {
      let message = '';

      try {
        loadEnv({ ...minimalEnv, DEMO_API_KEY: 'leak-me-please' });
      } catch (caught) {
        message = (caught as Error).message;
      }

      expect(message).not.toContain('leak-me-please');
    });
  });
});
