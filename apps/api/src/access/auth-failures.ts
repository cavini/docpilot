/**
 * How many wrong keys one client may try before being refused outright.
 *
 * Ten, because a person pasting a key can fumble it twice and should not be
 * locked out, and anything beyond that is not a person pasting a key.
 */
export const MAX_AUTH_FAILURES = 10;

/** How long the count is kept, in seconds. */
export const AUTH_FAILURE_WINDOW_SECONDS = 300;

/** Redis key holding one client's recent failures. */
export function authFailureKey(client: string): string {
  return `docpilot:auth-failures:${client}`;
}
