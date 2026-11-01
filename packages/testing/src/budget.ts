/**
 * What a spend ceiling reports, as the services that ask it see it.
 *
 * Structural rather than imported from the API package, because this package
 * is consumed by tests on both sides of the monorepo and must not depend on
 * either application.
 */
export interface BudgetLike {
  readonly enforced: boolean;
  status: () => Promise<{
    spentUsd: number;
    budgetUsd: number;
    exhausted: boolean;
    resetsAt: Date | null;
  }>;
  allowsModelCall: () => Promise<boolean>;
}

/**
 * A spend ceiling that is never reached.
 *
 * The default for every test that is not about the ceiling: without one, each
 * of them would have to say that it does not care, which is noise in four
 * files and an invitation to copy the wrong thing into a fifth.
 *
 * @returns A budget that allows every call.
 *
 * @example
 * ```ts
 * new AskService(env, retrieval, usage, logger, chatModel, budgetAllowing());
 * ```
 */
export function budgetAllowing(): BudgetLike {
  return {
    enforced: false,
    status: () => Promise.resolve({ spentUsd: 0, budgetUsd: 0, exhausted: false, resetsAt: null }),
    allowsModelCall: () => Promise.resolve(true),
  };
}

/**
 * A spend ceiling that has been reached.
 *
 * @param resetsAt When the window rolls over. Defaults to a fixed instant so
 *   an assertion on it does not have to allow for the clock.
 * @returns A budget that refuses every call.
 */
export function budgetExhausted(resetsAt = new Date('2026-11-02T00:00:00.000Z')): BudgetLike {
  return {
    enforced: true,
    status: () => Promise.resolve({ spentUsd: 0.5, budgetUsd: 0.5, exhausted: true, resetsAt }),
    allowsModelCall: () => Promise.resolve(false),
  };
}
