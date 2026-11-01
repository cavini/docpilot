import { AUTH_FAILURE_WINDOW_SECONDS, MAX_AUTH_FAILURES, authFailureKey } from './auth-failures.js';

describe('the failed-key budget', () => {
  it('namespaces the counter per client', () => {
    expect(authFailureKey('203.0.113.7')).toBe('docpilot:auth-failures:203.0.113.7');
    expect(authFailureKey('a')).not.toBe(authFailureKey('b'));
  });

  it('leaves room for a person fumbling a paste, and little more', () => {
    expect(MAX_AUTH_FAILURES).toBeGreaterThanOrEqual(3);
    expect(MAX_AUTH_FAILURES).toBeLessThanOrEqual(20);
  });

  it('caps guessing at a rate no search could get through', () => {
    // The number that matters: attempts per minute, against a key whose
    // space is far larger than anything this allows in a lifetime.
    const perMinute = (MAX_AUTH_FAILURES / AUTH_FAILURE_WINDOW_SECONDS) * 60;

    expect(perMinute).toBeLessThanOrEqual(5);
  });
});
