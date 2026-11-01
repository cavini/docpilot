/**
 * Price per million tokens, in US dollars.
 *
 * **Verified 2026-10-30** against
 * <https://developers.openai.com/api/docs/pricing> and Anthropic's published
 * model pricing. Prices change; this table is dated so a reader knows how much
 * to trust it, and `docs/costs.md` says how to re-check it.
 *
 * An unknown model costs zero rather than throwing. A usage row exists to
 * record what happened, and losing the record of a call because its price is
 * unknown would be worse than recording it with a cost of zero — which shows
 * up as an obvious gap rather than as a silent absence.
 *
 * **That default is safe for a ledger and unsafe for a ceiling.** The daily
 * spend ceiling sums this column, so a model missing from this table makes
 * every call look free and the ceiling never fires. The environment refuses
 * to start in that combination rather than running with the protection
 * silently off — see {@link hasKnownPrice} and `env.schema.ts`.
 */
export interface ModelPrice {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. Zero for embedding models. */
  outputPerMillion: number;
}

/** Date the prices below were last checked, for `docs/costs.md`. */
export const PRICING_VERIFIED_ON = '2026-11-01';

/** Prices per provider and model. */
export const PRICING: Record<string, Record<string, ModelPrice>> = {
  openai: {
    'text-embedding-3-small': { inputPerMillion: 0.02, outputPerMillion: 0 },
    'text-embedding-3-large': { inputPerMillion: 0.13, outputPerMillion: 0 },
    'text-embedding-ada-002': { inputPerMillion: 0.1, outputPerMillion: 0 },
    'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10 },
    'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2 },
    'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
    'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  },
  anthropic: {
    'claude-opus-5': { inputPerMillion: 5, outputPerMillion: 25 },
    'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15 },
    'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  },
  // The deterministic test provider. Free, and priced so that cost assertions
  // in tests have a known answer.
  mock: {},
};

/**
 * Works out what a call cost.
 *
 * @param provider Provider name, such as `openai`.
 * @param model Model id.
 * @param inputTokens Tokens sent.
 * @param outputTokens Tokens generated. Zero for embeddings.
 * @returns Cost in US dollars, rounded to six decimal places, which matches
 *   the precision of the column it is stored in.
 *
 * @example
 * ```ts
 * calculateCost('openai', 'text-embedding-3-small', 1_000_000, 0); // 0.02
 * ```
 */
export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[provider]?.[model];

  if (!price) {
    return 0;
  }

  const cost =
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Whether a price is known, so an unpriced model can be reported rather than hidden. */
export function hasKnownPrice(provider: string, model: string): boolean {
  return PRICING[provider]?.[model] !== undefined;
}
