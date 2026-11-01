/** Header the API expects the demo key in. */
export const DEMO_KEY_HEADER = 'x-demo-key';

/** Where the key is kept in the browser. */
const STORAGE_KEY = 'docpilot.demoKey';

/**
 * Whether this deployment is gated at all.
 *
 * Read from the build rather than from the API, because the interface has to
 * decide what to render **before** making any request: a client that probes
 * an endpoint to find out whether it is allowed to call endpoints has already
 * called one.
 */
export const DEMO_KEY_REQUIRED = process.env.NEXT_PUBLIC_DEMO_KEY_REQUIRED === 'true';

/**
 * Reads the stored key.
 *
 * `sessionStorage`, not `localStorage`: the key dies with the tab. A shared
 * demo secret left in a browser profile outlives the reason it was given out,
 * and on a shared machine it outlives the person who pasted it.
 *
 * @returns The key, or null when there is none or storage is unavailable.
 */
export function readDemoKey(): string | null {
  if (typeof window === 'undefined') {
    // Server render: there is no storage, and guessing would make the markup
    // disagree with the first client render.
    return null;
  }

  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled outright. The reader is then asked for the key
    // on every page load, which is worse than remembering it and better than
    // a blank screen.
    return null;
  }
}

/**
 * Stores the key, or forgets it when given null.
 *
 * @param key The key to keep, or null to clear it.
 */
export function writeDemoKey(key: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (key === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    }
  } catch {
    // Nothing to do about it, and nothing worth failing a render over.
  }
}

/**
 * The header to send with a request, if there is a key to send.
 *
 * Returns an empty object rather than a header with an empty value, because
 * an empty `x-demo-key` is a wrong key rather than an absent one, and the two
 * should not look the same to the server.
 *
 * @returns Headers to merge into a request.
 */
export function demoKeyHeaders(): Record<string, string> {
  const key = readDemoKey();

  return key === null || key === '' ? {} : { [DEMO_KEY_HEADER]: key };
}
