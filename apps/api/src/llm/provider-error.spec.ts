import { APICallError } from 'ai';

import { describeProviderFailure } from './provider-error.js';

/** An error shaped the way the SDK raises one. */
function apiError(
  statusCode: number,
  message = 'Rate limit reached for gpt-5 in org-abc123',
): APICallError {
  return new APICallError({
    message,
    url: 'https://api.openai.com/v1/responses',
    requestBodyValues: {},
    statusCode,
  });
}

describe('describeProviderFailure', () => {
  it('names a rate limit, because that one resolves by waiting', () => {
    expect(describeProviderFailure(apiError(429))).toMatch(/rate limited or out of credit/);
    expect(describeProviderFailure(apiError(429))).toMatch(/Try again in a minute/);
  });

  it('names rejected credentials, because retrying will not help', () => {
    expect(describeProviderFailure(apiError(401))).toMatch(/credentials/);
    expect(describeProviderFailure(apiError(403))).toMatch(/credentials/);
  });

  it('names a provider outage separately from a request this demo got wrong', () => {
    expect(describeProviderFailure(apiError(503))).toMatch(/provider is having trouble/);
    expect(describeProviderFailure(apiError(400))).toBe('The answer could not be completed.');
  });

  it('falls back to the generic sentence for anything that is not a provider call', () => {
    expect(describeProviderFailure(new Error('socket hang up'))).toBe(
      'The answer could not be completed.',
    );
    expect(describeProviderFailure(undefined)).toBe('The answer could not be completed.');
  });

  it('never passes the provider’s own message through', () => {
    // It can carry an organisation id, a request id or the tail of a prompt,
    // and this string is rendered in a browser.
    const leaky = apiError(429, 'Rate limit reached for org-abc123 on key sk-proj-XXXX');

    expect(describeProviderFailure(leaky)).not.toMatch(/org-abc123|sk-proj/);
  });

  it('says nothing about which model was being called', () => {
    expect(describeProviderFailure(apiError(429))).not.toMatch(/gpt-/);
  });
});
