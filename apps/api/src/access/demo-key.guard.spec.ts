import { type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { type Redis } from 'ioredis';

import { UnauthorizedError } from '../common/errors/index.js';
import { AUTH_FAILURE_WINDOW_SECONDS, MAX_AUTH_FAILURES, authFailureKey } from './auth-failures.js';

import { type Env } from '../config/env.schema.js';
import { DemoKeyGuard } from './demo-key.guard.js';

const KEY = 'c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2c';

/**
 * A request carrying the given headers, as the guard reads it.
 *
 * Carries `ip` and `socket` because Express always does, and a double that
 * omits them would let the guard dereference undefined without any test
 * noticing.
 */
function contextWith(
  headers: Record<string, string | undefined>,
  ip = '203.0.113.7',
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip, socket: { remoteAddress: ip } }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** A reflector that reports whether the handler is marked public. */
function reflectorSaying(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

/** A logger that records nothing, so a test run stays readable. */
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as ConstructorParameters<typeof DemoKeyGuard>[3];

/** An in-memory stand-in for the failure counter. */
function redisCounting(failing = false): { redis: Redis; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const redis = {
    incr: (key: string) => {
      if (failing) {
        return Promise.reject(new Error('no redis'));
      }

      const next = (counts.get(key) ?? 0) + 1;

      counts.set(key, next);

      return Promise.resolve(next);
    },
    expire: () => Promise.resolve(1),
  } as unknown as Redis;

  return { redis, counts };
}

function guardWith(
  demoKey: string,
  isPublic?: boolean,
  redis = redisCounting().redis,
): DemoKeyGuard {
  return new DemoKeyGuard(
    { DEMO_API_KEY: demoKey } as Env,
    reflectorSaying(isPublic),
    redis,
    logger,
  );
}

describe('DemoKeyGuard', () => {
  it('AC1: refuses a request with no key', async () => {
    await expect(guardWith(KEY).canActivate(contextWith({}))).rejects.toThrow(UnauthorizedError);
  });

  it('AC1: refuses a request with the wrong key', async () => {
    await expect(guardWith(KEY).canActivate(contextWith({ 'x-demo-key': 'nope' }))).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('allows a request with the right key', async () => {
    await expect(guardWith(KEY).canActivate(contextWith({ 'x-demo-key': KEY }))).resolves.toBe(
      true,
    );
  });

  it('AC3: allows everything when no key is configured', async () => {
    // The local default, and how the whole test suite runs. Checked before
    // anything else, so an open deployment never pays for a reflector lookup
    // it will not use.
    await expect(guardWith('').canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('AC4: allows a handler marked public even when a key is configured', async () => {
    await expect(guardWith(KEY, true).canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('AC4: closes a handler that is not marked, which is every handler by default', async () => {
    // Opt-out rather than opt-in: an endpoint added next year is protected
    // because nobody did anything, not because somebody remembered.
    await expect(guardWith(KEY, undefined).canActivate(contextWith({}))).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('names the header a caller should use, so the next attempt can succeed', async () => {
    await expect(guardWith(KEY).canActivate(contextWith({}))).rejects.toThrow(/x-demo-key/);
  });

  it('refuses with the code and status every other refusal uses', async () => {
    await expect(guardWith(KEY).canActivate(contextWith({}))).rejects.toMatchObject({
      code: 'unauthorized',
      httpStatus: 401,
    });
  });

  it('AC7: says nothing about the key that was supplied, or about the real one', async () => {
    let thrown = '';

    try {
      await guardWith(KEY).canActivate(contextWith({ 'x-demo-key': 'c2f1f0b1-wrong' }));
    } catch (caught) {
      const error = caught as UnauthorizedError;

      thrown = JSON.stringify({ message: error.message, details: error.details });
    }

    // Not its value, not its length, not whether it was close. A message that
    // says "wrong key" and one that says "key too short" are different
    // amounts of help to someone guessing.
    expect(thrown).not.toContain(KEY);
    expect(thrown).not.toContain('c2f1f0b1-wrong');
    expect(thrown).not.toMatch(/\d{2,}/);
  });

  it('AC7: ignores a key sent as a repeated header rather than trusting the array', async () => {
    // Express gives an array when a header is sent twice. Joining it would
    // let a caller send the right key alongside anything else.
    const repeated = { 'x-demo-key': [KEY, 'other'] } as unknown as Record<string, string>;

    await expect(guardWith(KEY).canActivate(contextWith(repeated))).rejects.toThrow(
      UnauthorizedError,
    );
  });

  describe('guessing at the key', () => {
    it('refuses with 429 once a client has tried too many wrong ones', async () => {
      const { redis } = redisCounting();
      const guard = guardWith(KEY, undefined, redis);

      for (let attempt = 0; attempt < MAX_AUTH_FAILURES; attempt += 1) {
        await expect(
          guard.canActivate(contextWith({ 'x-demo-key': `guess-${String(attempt)}` })),
        ).rejects.toMatchObject({ code: 'unauthorized' });
      }

      // The limiter proper runs after this guard, so without a counter here
      // nothing bounded guessing - measured at about a thousand attempts a
      // second before this existed.
      await expect(
        guard.canActivate(contextWith({ 'x-demo-key': 'one-too-many' })),
      ).rejects.toMatchObject({ code: 'too_many_requests', httpStatus: 429 });
    });

    it('counts per client, so one guesser cannot lock out a reader', async () => {
      const { redis, counts } = redisCounting();
      const guard = guardWith(KEY, undefined, redis);

      for (let attempt = 0; attempt < MAX_AUTH_FAILURES + 1; attempt += 1) {
        await guard
          .canActivate(contextWith({ 'x-demo-key': 'wrong' }, '198.51.100.1'))
          .catch(() => undefined);
      }

      // A different address still gets an honest 401 rather than inheriting
      // somebody else's lockout.
      await expect(
        guard.canActivate(contextWith({ 'x-demo-key': 'wrong' }, '203.0.113.9')),
      ).rejects.toMatchObject({ code: 'unauthorized' });

      expect(counts.get(authFailureKey('198.51.100.1'))).toBeGreaterThan(MAX_AUTH_FAILURES);
      expect(counts.get(authFailureKey('203.0.113.9'))).toBe(1);
    });

    it('never counts a request that had the right key', async () => {
      const { redis, counts } = redisCounting();
      const guard = guardWith(KEY, undefined, redis);

      for (let attempt = 0; attempt < 50; attempt += 1) {
        await expect(guard.canActivate(contextWith({ 'x-demo-key': KEY }))).resolves.toBe(true);
      }

      // The fast path costs nothing: a reader with the key never touches
      // Redis, so the counter is paid for only by the attempts it bounds.
      expect(counts.size).toBe(0);
    });

    it('serves a 401 rather than locking everyone out when Redis is down', async () => {
      const { redis } = redisCounting(true);

      // Degrading to the behaviour this had before the counter existed beats
      // turning a Redis outage into a demo nobody can open.
      await expect(
        guardWith(KEY, undefined, redis).canActivate(contextWith({ 'x-demo-key': 'wrong' })),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    });

    it('tells a blocked client when to come back', async () => {
      const { redis } = redisCounting();
      const guard = guardWith(KEY, undefined, redis);

      for (let attempt = 0; attempt <= MAX_AUTH_FAILURES; attempt += 1) {
        await guard.canActivate(contextWith({ 'x-demo-key': 'wrong' })).catch(() => undefined);
      }

      await expect(guard.canActivate(contextWith({ 'x-demo-key': 'wrong' }))).rejects.toMatchObject(
        { details: { retryAfterSeconds: AUTH_FAILURE_WINDOW_SECONDS } },
      );
    });
  });
});
