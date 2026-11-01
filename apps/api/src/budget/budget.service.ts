import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import { type Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { llmUsage } from '../db/schema/index.js';
import { REDIS } from '../redis/redis.tokens.js';
import { type BudgetStatus, decideBudget, nextUtcMidnight, startOfUtcDay } from './budget.js';

/**
 * How long a reading is reused before the ledger is asked again.
 *
 * Every answered question would otherwise run an extra query, and the number
 * cannot move far in a second - one call costs a fraction of a cent. The cost
 * of being a second stale is bounded by what can be spent in a second.
 */
const READING_TTL_MS = 1_000;

/**
 * Where the provider's own verdict is remembered.
 *
 * The ledger ceiling is a rate - what a day may cost - and the provider
 * balance is a total. A deployment can be comfortably inside today's ceiling
 * and still have nothing left to spend, and only the provider knows that.
 */
const PROVIDER_EXHAUSTED_KEY = 'docpilot:budget:provider-exhausted';

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
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.logger.setContext(BudgetService.name);
  }

  /**
   * Records that the provider says there is nothing left to spend.
   *
   * Called when a call comes back as exhausted rather than rate limited. From
   * then until the window rolls over, every path behaves exactly as it does
   * at the configured ceiling: answering falls back to the mock and says so,
   * ingestion refuses.
   *
   * Without this the demo would not degrade, it would just start failing -
   * every question an error, every upload a document stuck in `failed`. The
   * graceful path already exists; this is what connects the provider's
   * verdict to it.
   *
   * In Redis rather than in memory so every process agrees, and expiring at
   * the same instant the ledger window does, so a top-up is picked up by
   * tomorrow without a restart.
   */
  async markProviderExhausted(): Promise<void> {
    const now = new Date();
    const seconds = Math.max(
      60,
      Math.ceil((nextUtcMidnight(now).getTime() - now.getTime()) / 1000),
    );

    try {
      await this.redis.set(PROVIDER_EXHAUSTED_KEY, now.toISOString(), 'EX', seconds);
      // Dropped so the next read sees this rather than a reading from before
      // it, which would leave one more second of calls going to a provider
      // that has already said no.
      this.cached = null;
      this.logger.warn({ until: nextUtcMidnight(now) }, 'provider reports no credit; degrading');
    } catch (error) {
      // Nothing to do about it. The call that triggered this still failed
      // visibly, so the condition is not silent even when the latch is.
      this.logger.error({ err: error }, 'could not record provider exhaustion');
    }
  }

  /**
   * Whether the provider has said there is nothing left.
   *
   * A Redis failure reads as "not exhausted" rather than failing closed. The
   * ledger ceiling is the primary protection and fails closed on its own; if
   * this one did too, a Redis blip would put the demo on canned answers for
   * the rest of the day with nothing actually wrong.
   */
  private async providerExhausted(): Promise<boolean> {
    try {
      return (await this.redis.exists(PROVIDER_EXHAUSTED_KEY)) === 1;
    } catch {
      return false;
    }
  }

  /** Whether a ceiling is configured at all. */
  get enforced(): boolean {
    return this.env.DAILY_BUDGET_USD > 0;
  }

  /**
   * Whether any call could cost anything.
   *
   * False when every provider is the mock, which is local development and the
   * whole test suite. Nothing can be spent, so nothing needs reading - not
   * the ledger, and not the provider latch, which could never have been set.
   */
  private get canSpend(): boolean {
    return this.env.LLM_PROVIDER !== 'mock' || this.env.EMBEDDING_PROVIDER !== 'mock';
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

    if (!this.canSpend) {
      // Nothing can be spent, so nothing needs reading. The local default and
      // the whole test suite take this path.
      return decideBudget({ spentUsd: 0, budgetUsd: 0, now });
    }

    if (this.cached !== null && now.getTime() - this.cached.at < READING_TTL_MS) {
      return this.cached.status;
    }

    // The ledger is only queried when there is a ceiling for it to feed.
    // Without one there is still the provider's verdict below, which applies
    // either way: an empty balance is an empty balance.
    const ledger = this.enforced
      ? decideBudget({
          spentUsd: await this.spentToday(now),
          budgetUsd: this.env.DAILY_BUDGET_USD,
          now,
        })
      : decideBudget({ spentUsd: 0, budgetUsd: 0, now });

    // The provider's own verdict overrides the ledger's arithmetic. A
    // deployment can be well inside today's ceiling and still have an empty
    // balance, because the ceiling is a rate and the balance is a total.
    const status: BudgetStatus = (await this.providerExhausted())
      ? { ...ledger, exhausted: true }
      : ledger;

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
