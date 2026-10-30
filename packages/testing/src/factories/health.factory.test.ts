import { healthResponseSchema, rollUpHealthStatus } from '@docpilot/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildUnhealthyResponse,
  dependencyHealthFactory,
  healthResponseFactory,
} from './health.factory.js';

describe('healthResponseFactory', () => {
  beforeEach(() => {
    healthResponseFactory.reset();
    dependencyHealthFactory.reset();
  });

  it('AC1: produces an object the shared contract accepts', () => {
    // The point of a factory is that a test can trust its output. Validating
    // against the real schema means a fixture can never be a shape the API
    // would reject.
    expect(() => healthResponseSchema.parse(healthResponseFactory.build())).not.toThrow();
  });

  it('AC2: still produces a valid object after an override', () => {
    const result = healthResponseFactory.build({ status: 'degraded', version: '1.2.3' });

    expect(() => healthResponseSchema.parse(result)).not.toThrow();
    expect(result.version).toBe('1.2.3');
  });

  it('AC3: defaults to everything healthy', () => {
    const result = healthResponseFactory.build();

    expect(result.status).toBe('ok');
    expect(Object.values(result.dependencies).every((d) => d.status === 'ok')).toBe(true);
  });

  it('AC4: gives each dependency a distinct latency, so fixtures are distinguishable', () => {
    const first = dependencyHealthFactory.build();
    const second = dependencyHealthFactory.build();

    expect(first.latencyMs).not.toBe(second.latencyMs);
  });
});

describe('buildUnhealthyResponse', () => {
  it('AC5: marks the named dependency down', () => {
    const result = buildUnhealthyResponse('redis');

    expect(result.dependencies.redis).toStrictEqual({
      status: 'down',
      error: 'connection refused',
    });
  });

  it('AC6: leaves the other dependencies healthy', () => {
    const result = buildUnhealthyResponse('redis');

    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.storage.status).toBe('ok');
  });

  it('AC7: keeps the overall status consistent with the dependencies', () => {
    // An inconsistent fixture would let a bug hide: a test could assert on a
    // response the API could never actually produce.
    const result = buildUnhealthyResponse('database', 'degraded');

    expect(result.status).toBe(rollUpHealthStatus(Object.values(result.dependencies)));
  });

  it('AC8: accepts a custom reason', () => {
    const result = buildUnhealthyResponse('storage', 'down', 'NoSuchBucket');

    expect(result.dependencies.storage.error).toBe('NoSuchBucket');
  });

  it('AC9: produces an object the shared contract accepts', () => {
    expect(() => healthResponseSchema.parse(buildUnhealthyResponse('storage'))).not.toThrow();
  });
});
