import { APICallError } from 'ai';

/** What a reader is told when a stream could not be completed. */
const GENERIC = 'The answer could not be completed.';

/**
 * Turns a provider failure into something a reader can act on.
 *
 * Streaming endpoints cannot change their status code once the first byte is
 * out, so a failure mid-answer arrives as text. "The answer could not be
 * completed" is true for every one of them, which makes it useless for the
 * two that a reader - or the person running the demo - could actually do
 * something about.
 *
 * Nothing from the provider's own message is passed through. It can contain
 * an organisation id, a request id, or the tail of a prompt, and this string
 * is rendered in a browser.
 *
 * @param error Whatever the SDK threw.
 * @returns A sentence to show in place of the answer.
 *
 * @example
 * ```ts
 * onError: (error) => describeProviderFailure(error)
 * ```
 */
export function describeProviderFailure(error: unknown): string {
  if (!APICallError.isInstance(error)) {
    return GENERIC;
  }

  if (error.statusCode === 429) {
    // Two different problems wear this status: too many requests per minute,
    // and a spent balance. The provider distinguishes them only in a message
    // body that is not safe to pass through, so both are named.
    return (
      'The language model is rate limited or out of credit right now, ' +
      'so this answer could not be completed. Try again in a minute.'
    );
  }

  if (error.statusCode === 401 || error.statusCode === 403) {
    // Almost always a key that was rotated or scoped wrongly. The reader
    // cannot fix it, but saying so stops them retrying for ten minutes.
    return 'The language model rejected this deployment’s credentials, so no answer could be generated.';
  }

  if (error.statusCode !== undefined && error.statusCode >= 500) {
    return 'The language model provider is having trouble, so this answer could not be completed.';
  }

  return GENERIC;
}

/**
 * Whether this failure means the provider balance is gone.
 *
 * Both "too many requests this minute" and "no credit left" arrive as 429,
 * and they need opposite responses: the first clears by waiting a minute, the
 * second does not clear until somebody pays. Telling them apart means reading
 * the response body, which is fine — what is unsafe is *echoing* it, because
 * it can carry an organisation id or the tail of a prompt.
 *
 * Matched on the provider's stable error code rather than on prose. A wrong
 * answer here is cheap in one direction and not the other: treating a rate
 * limit as exhaustion would put the demo on canned answers for the rest of
 * the day over a blip, so the match is deliberately narrow and anything
 * unrecognised is read as a rate limit.
 *
 * @param error Whatever the SDK threw.
 * @returns True only when the balance is the problem.
 */
export function isCreditExhausted(error: unknown): boolean {
  if (!APICallError.isInstance(error) || error.statusCode !== 429) {
    return false;
  }

  const body = typeof error.responseBody === 'string' ? error.responseBody : '';

  return /insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached/.test(body);
}
