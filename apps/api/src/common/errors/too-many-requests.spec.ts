import { TooManyRequestsError } from './domain-error.js';

describe('TooManyRequestsError', () => {
  it('counts in seconds while seconds are readable', () => {
    expect(new TooManyRequestsError(45).message).toContain('45 seconds');
  });

  it('switches to minutes rather than counting past a hundred seconds', () => {
    expect(new TooManyRequestsError(300).message).toContain('about 5 minutes');
    expect(new TooManyRequestsError(60).message).toContain('a minute');
  });

  it('switches to hours for a daily limit', () => {
    // "Try again in 71384 seconds" is a number a reader has to do arithmetic
    // on before they can act on it.
    const message = new TooManyRequestsError(71_384).message;

    expect(message).toContain('about 20 hours');
    expect(message).not.toMatch(/\d{4,}/);
  });

  it('never says zero, because a client told to wait zero retries at once', () => {
    expect(new TooManyRequestsError(0).message).toContain('1 seconds');
  });

  it('keeps the exact figure in the details, for the Retry-After header', () => {
    expect(new TooManyRequestsError(71_384).details).toEqual({ retryAfterSeconds: 71_384 });
  });

  it('says why the limits are low, rather than just that they are', () => {
    expect(new TooManyRequestsError(60).message).toMatch(/demo paid for out of pocket/);
  });
});
