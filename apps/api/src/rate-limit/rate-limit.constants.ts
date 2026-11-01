/**
 * Two limits on every route, measuring different things.
 *
 * **Burst** is about hammering: how fast one client may go. It resets every
 * few minutes, so it bounds speed and nothing else — a determined client can
 * sit at the limit all day.
 *
 * **Daily** is about cost: how much one client may do in a day, full stop.
 * This is the one that matters for a prepaid balance. Without it, the burst
 * limit alone lets a single client spend several dollars a day on questions
 * and tens of dollars on uploads, leaving the daily spend ceiling as the only
 * thing between one visitor and the whole budget.
 *
 * Neither is per *person*. There is no identity here — one shared key means
 * the only thing to count against is the client address, so two people on one
 * office network share a budget and one person with a phone shares nothing.
 * It bounds blast radius, not identity, and the numbers are chosen to be
 * generous enough that the sharing case is still comfortable.
 */
export interface RateLimitTier {
  /** Requests allowed in the burst window. */
  burst: number;
  /** Length of the burst window, in seconds. */
  burstWindowSeconds: number;
  /** Requests allowed in a day. */
  daily: number;
}

/** Seconds in the daily window. */
export const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Limits by what a request costs.
 *
 * Calibrated against measured prices: one question is about $0.0011 on
 * `gpt-5-mini`, and a thorough look around the app is roughly twenty of them.
 * The daily figures leave room for that and a bit more, while keeping a
 * single client well short of a day's spend ceiling on their own.
 */
export const RATE_LIMITS = {
  /** Reads: a database query and nothing else. */
  reads: { burst: 120, burstWindowSeconds: 60, daily: 5_000 },

  /**
   * Anything that calls a model: `/ask`, `/chat`, `/agent`, `/extract`.
   *
   * Thirty a day is half as much again as a thorough exploration, and about
   * three cents. Fifteen different visitors can each have that before a
   * fifty-cent daily ceiling is reached.
   */
  answers: { burst: 10, burstWindowSeconds: 300, daily: 30 },

  /**
   * Uploads: embeddings, storage, and the CPU to parse a document.
   *
   * The count matters less than `MAX_UPLOAD_MB`: at the 20 MB default a
   * single upload costs about ten cents, which is a fifth of a fifty-cent
   * day in one action. A public deployment wants that limit lower, which is
   * why the deployment checklist says so.
   */
  uploads: { burst: 5, burstWindowSeconds: 900, daily: 10 },
} as const satisfies Record<string, RateLimitTier>;
