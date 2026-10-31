import { embeddingTextFor } from './chunk.js';

describe('embeddingTextFor', () => {
  it('AC1: prefixes the heading path, so the section travels with the passage', () => {
    // The passage under "Authentication" never says "authentication", so
    // without the heading its embedding sits far from "how do I authenticate?".
    const text = embeddingTextFor({
      headingPath: 'Billing API > Authentication',
      content: 'Call POST /auth/token with your client credentials.',
    });

    expect(text).toBe(
      'Billing API > Authentication\n\nCall POST /auth/token with your client credentials.',
    );
  });

  it('AC2: returns the content unchanged when there is no heading', () => {
    expect(embeddingTextFor({ headingPath: null, content: 'Plain text.' })).toBe('Plain text.');
  });

  it('AC3: does not alter the content itself', () => {
    const content = 'Every endpoint allows 120 requests per minute.';

    expect(embeddingTextFor({ headingPath: 'Limits', content })).toContain(content);
  });
});
