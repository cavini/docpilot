import { DEMO_KEY_HEADER, matchesDemoKey } from './demo-key.js';

const KEY = 'c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2c';

describe('matchesDemoKey', () => {
  it('accepts the configured key', () => {
    expect(matchesDemoKey(KEY, KEY)).toBe(true);
  });

  it('AC1: rejects a missing key', () => {
    expect(matchesDemoKey(undefined, KEY)).toBe(false);
    expect(matchesDemoKey('', KEY)).toBe(false);
  });

  it('AC2: rejects a wrong key of the same length', () => {
    expect(matchesDemoKey('c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2d', KEY)).toBe(false);
  });

  it('AC2: rejects a prefix of the right key', () => {
    // The case a length check would short-circuit, which is how a naive
    // comparison tells an attacker how long the secret is.
    expect(matchesDemoKey(KEY.slice(0, 8), KEY)).toBe(false);
    expect(matchesDemoKey(KEY + 'x', KEY)).toBe(false);
  });

  it('AC2: compares digests, so length never decides the answer early', () => {
    // Asserted structurally rather than by timing: a benchmark that measures
    // two comparisons and claims they are equal is a flaky test wearing a
    // security hat. What is checkable is that one byte of difference and a
    // thousand bytes of difference both reach the same comparison.
    expect(matchesDemoKey('x', KEY)).toBe(false);
    expect(matchesDemoKey('x'.repeat(10_000), KEY)).toBe(false);
  });

  it('tolerates a pasted key with surrounding whitespace', () => {
    expect(matchesDemoKey(`  ${KEY}\n`, KEY)).toBe(true);
  });

  it('matches nothing when no key is configured', () => {
    // An empty configured key means the gate is off, which is a decision for
    // the guard. If it ever reaches here, matching everything would be the
    // worst possible reading of it.
    expect(matchesDemoKey('', '')).toBe(false);
    expect(matchesDemoKey('anything', '')).toBe(false);
  });

  it('names the header in lower case, as Node delivers it', () => {
    expect(DEMO_KEY_HEADER).toBe('x-demo-key');
  });
});
