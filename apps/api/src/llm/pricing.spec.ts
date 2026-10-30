import { PRICING_VERIFIED_ON, calculateCost, hasKnownPrice } from './pricing.js';

describe('calculateCost', () => {
  it('AC1: prices a million embedding tokens at the published rate', () => {
    expect(calculateCost('openai', 'text-embedding-3-small', 1_000_000, 0)).toBe(0.02);
  });

  it('AC2: prices input and output separately for a chat model', () => {
    // 1M input at $5 plus 1M output at $25.
    expect(calculateCost('anthropic', 'claude-opus-5', 1_000_000, 1_000_000)).toBe(30);
  });

  it('AC3: scales linearly below a million tokens', () => {
    expect(calculateCost('openai', 'text-embedding-3-small', 500_000, 0)).toBe(0.01);
  });

  it('AC4: rounds to the precision the column stores', () => {
    const cost = calculateCost('openai', 'text-embedding-3-small', 1, 0);

    expect(cost.toString()).toMatch(/^0(\.\d{1,6})?$/);
  });

  it('AC5: costs nothing for the mock provider', () => {
    expect(calculateCost('mock', 'mock-embedding', 10_000, 10_000)).toBe(0);
  });

  it('AC6: records an unknown model as zero rather than throwing', () => {
    // Losing the record of a call because its price is unknown is worse than
    // recording it at zero, which shows up as an obvious gap.
    expect(calculateCost('openai', 'some-model-released-tomorrow', 1_000, 0)).toBe(0);
    expect(calculateCost('nobody', 'nothing', 1_000, 0)).toBe(0);
  });

  it('AC7: reports whether a price is known, so a gap can be surfaced', () => {
    expect(hasKnownPrice('openai', 'text-embedding-3-small')).toBe(true);
    expect(hasKnownPrice('openai', 'some-model-released-tomorrow')).toBe(false);
  });

  it('AC8: costs nothing for zero tokens', () => {
    expect(calculateCost('anthropic', 'claude-opus-5', 0, 0)).toBe(0);
  });

  it('AC9: carries the date the prices were checked', () => {
    expect(PRICING_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
