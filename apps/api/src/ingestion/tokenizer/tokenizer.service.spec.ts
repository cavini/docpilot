import { TokenizerService } from './tokenizer.service.js';

describe('TokenizerService', () => {
  const tokenizer = new TokenizerService();

  it('AC1: counts tokens, not characters', () => {
    // Twelve characters, far fewer tokens.
    expect(tokenizer.count('hello world')).toBeLessThan('hello world'.length);
    expect(tokenizer.count('hello world')).toBeGreaterThan(0);
  });

  it('AC2: counts nothing for an empty string', () => {
    expect(tokenizer.count('')).toBe(0);
  });

  it('AC3: counts accented Portuguese text', () => {
    const count = tokenizer.count('autenticação');

    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan('autenticação'.length);
  });

  it('AC4: shows that character count is a poor proxy for token count', () => {
    // The same number of characters, very different token counts. This is the
    // whole reason chunk sizes are stated in tokens rather than characters.
    const prose = 'the quick brown fox jumps over the lazy dog';
    const repeated = 'a'.repeat(prose.length);

    expect(repeated).toHaveLength(prose.length);
    expect(tokenizer.count(repeated)).not.toBe(tokenizer.count(prose));
  });

  it('AC4b: charges several tokens for a single emoji character', () => {
    // One character, several tokens: an estimate based on length would
    // undercount a document full of them.
    expect(tokenizer.count('🔐')).toBeGreaterThan(1);
  });

  it('AC5: is deterministic', () => {
    expect(tokenizer.count('POST /auth/token')).toBe(tokenizer.count('POST /auth/token'));
  });

  it('AC6: exposes a plain counter function for code that takes one', () => {
    expect(tokenizer.counter('hello world')).toBe(tokenizer.count('hello world'));
  });

  it('AC7: loads the encoding once, not per call', () => {
    const fresh = new TokenizerService();

    const first = Date.now();
    fresh.count('warm up');
    const warmup = Date.now() - first;

    const second = Date.now();
    for (let i = 0; i < 200; i += 1) {
      fresh.count('the quick brown fox');
    }
    const after = Date.now() - second;

    expect(after).toBeLessThanOrEqual(Math.max(warmup, 50));
  });
});
