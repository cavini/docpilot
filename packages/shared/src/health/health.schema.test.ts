import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health.schema.js';

const validResponse = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 12.5,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
};

describe('healthResponseSchema', () => {
  it('AC6: accepts a fully populated response', () => {
    expect(healthResponseSchema.parse(validResponse)).toStrictEqual(validResponse);
  });

  it('AC7: accepts a failing dependency that reports an error instead of a latency', () => {
    const result = healthResponseSchema.parse({
      ...validResponse,
      status: 'down',
      dependencies: {
        ...validResponse.dependencies,
        redis: { status: 'down', error: 'connection refused' },
      },
    });

    expect(result.dependencies.redis).toStrictEqual({
      status: 'down',
      error: 'connection refused',
    });
  });

  it('AC8: rejects a status outside the known set', () => {
    const result = healthResponseSchema.safeParse({ ...validResponse, status: 'probably-fine' });

    expect(result.success).toBe(false);
  });

  it('AC9: rejects a checkedAt that is not an ISO 8601 timestamp', () => {
    const result = healthResponseSchema.safeParse({ ...validResponse, checkedAt: '30/10/2026' });

    expect(result.success).toBe(false);
  });

  it('AC10: rejects a missing dependency, so a silently unprobed system cannot pass', () => {
    const { redis: _redis, ...withoutRedis } = validResponse.dependencies;
    const result = healthResponseSchema.safeParse({
      ...validResponse,
      dependencies: withoutRedis,
    });

    expect(result.success).toBe(false);
  });

  it('AC11: rejects a negative latency', () => {
    const result = healthResponseSchema.safeParse({
      ...validResponse,
      dependencies: {
        ...validResponse.dependencies,
        database: { status: 'ok', latencyMs: -1 },
      },
    });

    expect(result.success).toBe(false);
  });
});
