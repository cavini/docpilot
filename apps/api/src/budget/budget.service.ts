import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { llmUsage } from '../db/schema/index.js';
import { type BudgetStatus, decideBudget, startOfUtcDay } from './budget.js';

/**
 * How long a reading is reused before the ledger is asked again.
 *
 * Every answered question would otherwise run an extra query, and the number
 * cannot move far in a second - one call costs a fraction of a cent. The cost
 * of being a second stale is bounded by what can be spent in a second.
 */
const READING_TTL_MS = 1_000;

/**
 * What a day of model calls has cost, against what is allowed.
 *
 * The measure that protects a hosted demo's provider balance. Rate limits
 * count requests, and requests are not dollars: one agent turn can be six
 * model calls and a cached search can be none.
 *
 * Nothing here blocks anything. It reports, and each caller decides - because
 * the right answer differs by what the call would leave behind. Answering
 * degrades to the mock provider, which is disposable. Ingestion refuses,
 * because a document embedded by the mock sits in the corpus returning
 * confident nonsense for every future search and nothing would ever say so.
 */
@Injectable()
export class BudgetService {
  /** The last reading, reused for {@link READING_TTL_MS}. */
  private cached: { at: number; status: BudgetStatus } | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DATABASE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BudgetService.name);
  }

  /** Whether a ceiling is configured at all. */
  get enforced(): boolean {
    return this.env.DAILY_BUDGET_USD > 0;
  }

  /**
   * Reads what has been spent since midnight UTC, against the ceiling.
   *
   * A ledger that cannot be read counts as exhausted: unknown spend is not
   * zero spend, and the other default fails towards a bill.
   *
   * @returns Spend, ceiling, whether a real provider may be called, and when
   *   the window rolls over.
   */
  async status(): Promise<BudgetStatus> {
    const now = new Date();

    if (!this.enforced) {
      // No query at all when there is nothing to enforce. The local default,
      // and the whole test suite.
      return decideBudget({ spentUsd: 0, budgetUsd: 0, now });
    }

    if (this.cached !== null && now.getTime() - this.cached.at < READING_TTL_MS) {
      return this.cached.status;
    }

    const status = decideBudget({
      spentUsd: await this.spentToday(now),
      budgetUsd: this.env.DAILY_BUDGET_USD,
      now,
    });

    this.cached = { at: now.getTime(), status };

    return status;
  }

  /**
   * Whether a real provider may be called.
   *
   * @returns True while there is budget left, or no ceiling is configured.
   */
  async allowsModelCall(): Promise<boolean> {
    return !(await this.status()).exhausted;
  }

  /**
   * Sums the ledger since midnight UTC.
   *
   * @param now The instant whose day to sum.
   * @returns The total in US dollars, or null when the ledger cannot be read.
   */
  private async spentToday(now: Date): Promise<number | null> {
    try {
      const [row] = await this.db
        .select({
          // `numeric` comes back as a string, because a sum of them does not
          // fit a double without drifting. Parsed here, where the value is
          // compared against a ceiling rather than accumulated further.
          total: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, startOfUtcDay(now)));

      return Number(row?.total ?? 0);
    } catch (error) {
      this.logger.error(
        { err: error },
        'could not read the usage ledger; treating the budget as spent',
      );

      return null;
    }
  }
}
