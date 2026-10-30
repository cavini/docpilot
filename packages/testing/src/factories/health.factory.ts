import { type DependencyHealth, type HealthResponse, type HealthStatus } from '@docpilot/shared';

import { defineFactory } from './define-factory.js';

/** Builds the health of one dependency. Defaults to healthy. */
export const dependencyHealthFactory = defineFactory<DependencyHealth>((sequence) => ({
  status: 'ok',
  latencyMs: sequence,
}));

/**
 * Builds a `GET /health` response. Defaults to everything healthy.
 *
 * @example
 * ```ts
 * healthResponseFactory.build({ status: 'down' });
 * ```
 */
export const healthResponseFactory = defineFactory<HealthResponse>(() => ({
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 42,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
}));

/**
 * Builds a health response in which one named dependency has failed.
 *
 * The overall status follows the failing dependency, so the result is a
 * response the API could actually have produced rather than an inconsistent
 * one that would let a bug hide.
 *
 * @param dependency Which dependency failed.
 * @param status How badly. Defaults to `down`.
 * @param error Reason reported for the failure.
 *
 * @example
 * ```ts
 * buildUnhealthyResponse('redis', 'down', 'connection refused');
 * ```
 */
export function buildUnhealthyResponse(
  dependency: keyof HealthResponse['dependencies'],
  status: Exclude<HealthStatus, 'ok'> = 'down',
  error = 'connection refused',
): HealthResponse {
  const base = healthResponseFactory.build();

  return {
    ...base,
    status,
    dependencies: {
      ...base.dependencies,
      [dependency]: { status, error },
    },
  };
}
