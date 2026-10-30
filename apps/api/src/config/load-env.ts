import { type ZodError } from 'zod';

import { type Env, envSchema } from './env.schema.js';

/**
 * Thrown when the environment does not satisfy {@link envSchema}. Carries a
 * message listing every problem at once, so a misconfigured deployment needs
 * one restart to diagnose rather than one per missing variable.
 */
export class EnvValidationError extends Error {
  /** Every validation problem, as `VARIABLE: reason`. */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      [
        'Invalid environment configuration:',
        ...problems.map((problem) => `  - ${problem}`),
        '',
        'See .env.example for every supported variable.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
    this.problems = problems;
  }
}

/** Formats a Zod error as one readable `VARIABLE: reason` line per problem. */
function describeProblems(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const variable = issue.path.join('.');
    return variable ? `${variable}: ${issue.message}` : issue.message;
  });
}

/**
 * Validates and parses the environment.
 *
 * Called before the Nest application is created, so a configuration mistake
 * stops the process immediately with a readable message instead of surfacing
 * as a confusing runtime failure on the first request that needs the value.
 *
 * @param source Environment to read, defaulting to `process.env`.
 * @returns The validated configuration, with defaults applied and strings
 *   coerced to numbers and booleans.
 * @throws {EnvValidationError} If any variable is missing or invalid. The
 *   message lists every problem found.
 *
 * @example
 * ```ts
 * const env = loadEnv({ DATABASE_URL: '...', REDIS_URL: '...' });
 * env.API_PORT; // 3001, as a number
 * ```
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(describeProblems(result.error));
  }

  return result.data;
}
