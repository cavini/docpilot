/**
 * What has been spent, against what is allowed.
 *
 * Reported rather than just decided, because the interface says so to the
 * reader and `GET /access` returns it. A bare boolean would make "why am I
 * seeing canned answers" a question only the logs could answer.
 */
export interface BudgetStatus {
  /** Spent since the window opened, in US dollars. */
  spentUsd: number;
  /** The ceiling. Zero means there is not one. */
  budgetUsd: number;
  /** Whether a real provider may be called. */
  exhausted: boolean;
  /** When the window rolls over. Null when there is no ceiling. */
  resetsAt: Date | null;
}

/** What the decision is made from. */
export interface BudgetReading {
  /** Spend read from the ledger, or null when it could not be read. */
  spentUsd: number | null;
  /** `DAILY_BUDGET_USD`. Zero disables the ceiling. */
  budgetUsd: number;
  /** Used to work out when the window rolls over. */
  now: Date;
}

/**
 * Start of the UTC day containing `now`.
 *
 * A calendar day rather than a rolling 24 hours, so there is an answer to
 * "when does it reset" that can be put in front of a reader. A rolling window
 * is fairer but resets continuously, which is not a sentence anyone wants to
 * read on a demo page.
 *
 * UTC rather than local, because the server's timezone is an accident of where
 * it is hosted and the number should not change when that does.
 *
 * @param now Any instant.
 * @returns Midnight UTC at the start of that day.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The next midnight UTC strictly after `now`.
 *
 * Strictly after: at exactly midnight the window that just opened runs for a
 * full day, so the answer is tomorrow rather than this instant.
 *
 * @param now Any instant.
 * @returns When the current window ends.
 */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * Decides whether a real provider may be called.
 *
 * **A ledger that cannot be read counts as exhausted.** Unknown spend is not
 * zero spend, and the failure that matters here is the one where a database
 * blip quietly removes the only thing standing between a public URL and my
 * balance. The opposite default fails towards a bill.
 *
 * Kept pure so the rule is testable without a database: the query lives in
 * {@link BudgetService} and this is the decision it feeds.
 *
 * @param reading Spend, ceiling and the current instant.
 * @returns The status, ready to report.
 *
 * @example
 * ```ts
 * decideBudget({ spentUsd: 0.5, budgetUsd: 0.5, now }).exhausted; // true
 * decideBudget({ spentUsd: null, budgetUsd: 0.5, now }).exhausted; // true
 * decideBudget({ spentUsd: 999, budgetUsd: 0, now }).exhausted; // false
 * ```
 */
export function decideBudget({ spentUsd, budgetUsd, now }: BudgetReading): BudgetStatus {
  if (budgetUsd <= 0) {
    // No ceiling was configured. Said plainly rather than represented as a
    // very large one, so the startup log can report it as off.
    return { spentUsd: spentUsd ?? 0, budgetUsd: 0, exhausted: false, resetsAt: null };
  }

  return {
    spentUsd: spentUsd ?? 0,
    budgetUsd,
    exhausted: spentUsd === null || spentUsd >= budgetUsd,
    resetsAt: nextUtcMidnight(now),
  };
}
