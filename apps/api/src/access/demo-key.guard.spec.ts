import { type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { UnauthorizedError } from '../common/errors/index.js';

import { type Env } from '../config/env.schema.js';
import { DemoKeyGuard } from './demo-key.guard.js';

const KEY = 'c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2c';

/** A request carrying the given headers, as the guard reads it. */
function contextWith(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** A reflector that reports whether the handler is marked public. */
function reflectorSaying(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

function guardWith(demoKey: string, isPublic?: boolean): DemoKeyGuard {
  return new DemoKeyGuard({ DEMO_API_KEY: demoKey } as Env, reflectorSaying(isPublic));
}

describe('DemoKeyGuard', () => {
  it('AC1: refuses a request with no key', () => {
    expect(() => guardWith(KEY).canActivate(contextWith({}))).toThrow(UnauthorizedError);
  });

  it('AC1: refuses a request with the wrong key', () => {
    expect(() => guardWith(KEY).canActivate(contextWith({ 'x-demo-key': 'nope' }))).toThrow(
      UnauthorizedError,
    );
  });

  it('allows a request with the right key', () => {
    expect(guardWith(KEY).canActivate(contextWith({ 'x-demo-key': KEY }))).toBe(true);
  });

  it('AC3: allows everything when no key is configured', () => {
    // The local default, and how the whole test suite runs. Checked before
    // anything else, so an open deployment never pays for a reflector lookup
    // it will not use.
    expect(guardWith('').canActivate(contextWith({}))).toBe(true);
  });

  it('AC4: allows a handler marked public even when a key is configured', () => {
    expect(guardWith(KEY, true).canActivate(contextWith({}))).toBe(true);
  });

  it('AC4: closes a handler that is not marked, which is every handler by default', () => {
    // Opt-out rather than opt-in: an endpoint added next year is protected
    // because nobody did anything, not because somebody remembered.
    expect(() => guardWith(KEY, undefined).canActivate(contextWith({}))).toThrow(UnauthorizedError);
  });

  it('names the header a caller should use, so the next attempt can succeed', () => {
    expect(() => guardWith(KEY).canActivate(contextWith({}))).toThrow(/x-demo-key/);
  });

  it('refuses with the code and status every other refusal uses', () => {
    try {
      guardWith(KEY).canActivate(contextWith({}));
      throw new Error('expected a refusal');
    } catch (caught) {
      expect(caught).toMatchObject({ code: 'unauthorized', httpStatus: 401 });
    }
  });

  it('AC7: says nothing about the key that was supplied, or about the real one', () => {
    let thrown = '';

    try {
      guardWith(KEY).canActivate(contextWith({ 'x-demo-key': 'c2f1f0b1-wrong' }));
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

  it('AC7: ignores a key sent as a repeated header rather than trusting the array', () => {
    // Express gives an array when a header is sent twice. Joining it would
    // let a caller send the right key alongside anything else.
    const repeated = { 'x-demo-key': [KEY, 'other'] } as unknown as Record<string, string>;

    expect(() => guardWith(KEY).canActivate(contextWith(repeated))).toThrow(UnauthorizedError);
  });
});
