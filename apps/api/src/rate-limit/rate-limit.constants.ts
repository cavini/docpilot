/**
 * How many requests a client may make, by what the request costs me.
 *
 * Counted per window per client. These are not a cost control - a request
 * limit has no dollars in it, which is what `DAILY_BUDGET_USD` is for. What
 * they bound is how fast one client can get through the budget, and how much
 * of the machine one client can occupy.
 *
 * Generous on purpose. This is a demo shown to a handful of people, and a
 * reader who hits a limit while genuinely exploring learns the wrong thing
 * about the product.
 */
export const RATE_LIMITS = {
  /** Reads: a database query and nothing else. */
  reads: { limit: 120, ttlSeconds: 60 },

  /**
   * Anything that calls a model: `/ask`, `/chat`, `/agent`, `/extract`.
   *
   * One agent turn can be several model calls, so this is the group where a
   * request is worth real money.
   */
  answers: { limit: 20, ttlSeconds: 300 },

  /** Uploads: embeddings, storage, and the CPU to parse a document. */
  uploads: { limit: 10, ttlSeconds: 3_600 },
} as const;
