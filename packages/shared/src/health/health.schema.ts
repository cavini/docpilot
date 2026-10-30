import { z } from 'zod';

/**
 * The three states a health check can report.
 *
 * - `ok`: the dependency answered within its timeout.
 * - `degraded`: the dependency answered, but something is wrong that does not
 *   stop the application serving requests.
 * - `down`: the dependency did not answer, or answered with an error.
 */
export const HEALTH_STATUSES = ['ok', 'degraded', 'down'] as const;

/** Schema for a single health status value. */
export const healthStatusSchema = z
  .enum(HEALTH_STATUSES)
  .describe('Whether a dependency, or the application as a whole, is usable');

/** A single health status value. */
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** Schema for the result of probing one dependency. */
export const dependencyHealthSchema = z
  .object({
    status: healthStatusSchema,
    latencyMs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Round trip time of the probe, omitted when the probe did not complete'),
    error: z
      .string()
      .optional()
      .describe('Human readable failure reason, never containing credentials'),
  })
  .describe('Result of probing a single dependency');

/** The result of probing one dependency. */
export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;

/** Schema for the dependencies the API reports on. */
export const healthDependenciesSchema = z
  .object({
    database: dependencyHealthSchema,
    redis: dependencyHealthSchema,
    storage: dependencyHealthSchema,
  })
  .describe('Every external system the API needs in order to serve requests');

/** The dependencies the API reports on. */
export type HealthDependencies = z.infer<typeof healthDependenciesSchema>;

/** Schema for the `GET /health` response body. */
export const healthResponseSchema = z
  .object({
    status: healthStatusSchema.describe('Worst status across every dependency'),
    version: z.string().describe('Application version, taken from package.json'),
    uptimeSeconds: z.number().nonnegative().describe('Seconds since the process started'),
    checkedAt: z.iso.datetime().describe('When the probes ran, as an ISO 8601 timestamp'),
    dependencies: healthDependenciesSchema,
  })
  .describe('Health of the API and everything it depends on');

/** The `GET /health` response body. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;
