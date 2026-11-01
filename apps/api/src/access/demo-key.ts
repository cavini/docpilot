import { createHash, timingSafeEqual } from 'node:crypto';

/** Header the demo key is sent in. */
export const DEMO_KEY_HEADER = 'x-demo-key';

/**
 * Whether a supplied key matches the configured one.
 *
 * **Compared on digests, not on the strings.** A digest is always 32 bytes,
 * so `timingSafeEqual` cannot throw on a length mismatch - and because it
 * cannot, the comparison never returns early on length, which is the one
 * thing a naive guard leaks for free.
 *
 * The supplied key is trimmed because people paste, and a trailing newline
 * turning into a 401 is a support question with no useful answer.
 *
 * @param supplied What arrived in the request header, if anything.
 * @param expected The configured key. An empty one matches nothing; callers
 *   decide separately whether the gate is on at all.
 * @returns True when the two are the same key.
 *
 * @example
 * ```ts
 * matchesDemoKey(request.headers['x-demo-key'], env.DEMO_API_KEY);
 * ```
 */
export function matchesDemoKey(supplied: string | undefined, expected: string): boolean {
  if (expected === '') {
    return false;
  }

  const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

  return timingSafeEqual(digest((supplied ?? '').trim()), digest(expected));
}
