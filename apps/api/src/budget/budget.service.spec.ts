import { type Env } from '../config/env.schema.js';
import { type Database } from '../db/database.type.js';
import { type Redis } from 'ioredis';

import { BudgetService } from './budget.service.js';

/** A logger that records nothing, so a test run stays readable. */
const logger = {
  setContext: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
} as unknown as ConstructorParameters<typeof BudgetService>[2];

/**
 * Stands in for the Drizzle query builder.
 *
 * The chain is stubbed rather than a database started: what is under test is
 * the rule applied to what comes back, especially the branch where nothing
 * does. The query itself is covered against real Postgres in the integration
 * suite, which is where a wrong column name would show.
 */
function dbReturning(answer: { total: string }[] | Error): { db: Database; calls: () => number } {
  let calls = 0;
  const db = {
    select: () => {
      calls += 1;

      return {
        from: () => ({
          where: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)),
        }),
      };
    },
  } as unknown as Database;

  return { db, calls: () => calls };
}

const envWith = (budget: number): Env =>
  ({ DAILY_BUDGET_USD: budget, LLM_PROVIDER: 'openai', EMBEDDING_PROVIDER: 'openai' }) as Env;

/** A Redis that reports whether the provider-exhausted latch is set. */
function redisWith(latched: boolean | Error = false): Redis {
  const store = new Map<string, string>();

  if (latched === true) {
    store.set('docpilot:budget:provider-exhausted', 'yes');
  }

  return {
    exists: (key: string) =>
      latched instanceof Error ? Promise.reject(latched) : Promise.resolve(store.has(key) ? 1 : 0),
    set: (key: string, value: string) => {
      store.set(key, value);

      return Promise.resolve('OK');
    },
  } as unknown as Redis;
}

/** Builds the service with everything substituted. */
function serviceWith(
  budget: number,
  answer: Parameters<typeof dbReturning>[0],
  redis = redisWith(),
) {
  return new BudgetService(envWith(budget), dbReturning(answer).db, logger, redis);
}

describe('BudgetService', () => {
  it('reports no ceiling when the budget is zero', () => {
    const { db } = dbReturning([]);

    expect(new BudgetService(envWith(0), db, logger, redisWith()).enforced).toBe(false);
    expect(new BudgetService(envWith(0.5), db, logger, redisWith()).enforced).toBe(true);
  });

  it('does not touch the ledger when there is no ceiling to enforce', async () => {
    const { db, calls } = dbReturning([{ total: '99' }]);
    const service = new BudgetService(envWith(0), db, logger, redisWith());

    await expect(service.allowsModelCall()).resolves.toBe(true);

    // A query per answered question, to enforce nothing, is a query not worth
    // running. The provider latch is still read, because an empty balance
    // applies whether or not a ceiling is configured.
    expect(calls()).toBe(0);
  });

  it('reads nothing at all when every provider is the mock', async () => {
    // Local development and the whole test suite. Nothing can be spent, so
    // neither the ledger nor the latch could say anything useful.
    const { db, calls } = dbReturning([{ total: '99' }]);
    const env = { DAILY_BUDGET_USD: 0.5, LLM_PROVIDER: 'mock', EMBEDDING_PROVIDER: 'mock' } as Env;
    const redis = redisWith(new Error('redis would have been read'));

    await expect(new BudgetService(env, db, logger, redis).allowsModelCall()).resolves.toBe(true);
    expect(calls()).toBe(0);
  });

  it('AC10: allows a call while the day is below the ceiling', async () => {
    const { db } = dbReturning([{ total: '0.1234' }]);
    const status = await new BudgetService(envWith(0.5), db, logger, redisWith()).status();

    expect(status).toMatchObject({ spentUsd: 0.1234, budgetUsd: 0.5, exhausted: false });
    expect(status.resetsAt).toBeInstanceOf(Date);
  });

  it('AC11: refuses once the day reaches the ceiling', async () => {
    const { db } = dbReturning([{ total: '0.5' }]);

    await expect(
      new BudgetService(envWith(0.5), db, logger, redisWith()).allowsModelCall(),
    ).resolves.toBe(false);
  });

  it('reads the sum as a decimal string rather than as a float', async () => {
    // `numeric` comes back as a string precisely because summing these as
    // doubles drifts. A service that assumed a number would get NaN here.
    const { db } = dbReturning([{ total: '0.000123' }]);

    expect((await new BudgetService(envWith(1), db, logger, redisWith()).status()).spentUsd).toBe(
      0.000123,
    );
  });

  it('treats an empty ledger as nothing spent', async () => {
    const { db } = dbReturning([]);
    const status = await new BudgetService(envWith(0.5), db, logger, redisWith()).status();

    expect(status.spentUsd).toBe(0);
    expect(status.exhausted).toBe(false);
  });

  it('treats an unreadable ledger as spent, not as zero', async () => {
    // The failure that matters: a database blip quietly removing the only
    // thing between a public URL and the provider balance.
    const { db } = dbReturning(new Error('connection terminated'));

    await expect(
      new BudgetService(envWith(0.5), db, logger, redisWith()).allowsModelCall(),
    ).resolves.toBe(false);
  });

  it('reuses a reading rather than querying for every answered question', async () => {
    const { db, calls } = dbReturning([{ total: '0.1' }]);
    const service = new BudgetService(envWith(0.5), db, logger, redisWith());

    await service.status();
    await service.status();
    await service.status();

    // The number cannot move far in a second, and one call costs a fraction
    // of a cent, so the staleness is bounded by what a second can spend.
    expect(calls()).toBe(1);
  });

  describe('when the provider says there is nothing left', () => {
    it('is exhausted even though today is well inside the ceiling', async () => {
      // The ledger ceiling is a rate - what a day may cost. The provider
      // balance is a total. A deployment can be comfortably inside the first
      // and have nothing left of the second, and only the provider knows.
      const service = serviceWith(0.5, [{ total: '0.01' }], redisWith(true));
      const status = await service.status();

      expect(status.exhausted).toBe(true);
      expect(status.spentUsd).toBe(0.01);
    });

    it('still reports the day spend, so the number does not look wrong', async () => {
      const status = await serviceWith(0.5, [{ total: '0.12' }], redisWith(true)).status();

      expect(status).toMatchObject({ spentUsd: 0.12, budgetUsd: 0.5, exhausted: true });
    });

    it('overrides even when no ceiling is configured', async () => {
      // Someone running without a ceiling still cannot spend a balance that
      // is empty, and a demo that degrades beats one that errors.
      expect(await serviceWith(0, [{ total: '0' }], redisWith(true)).allowsModelCall()).toBe(false);
    });

    it('does not fail closed when Redis cannot be read', async () => {
      // The ledger ceiling is the primary protection and fails closed on its
      // own. If this one did too, a Redis blip would put the demo on canned
      // answers for the rest of the day with nothing actually wrong.
      const service = serviceWith(0.5, [{ total: '0.01' }], redisWith(new Error('no redis')));

      expect(await service.allowsModelCall()).toBe(true);
    });

    it('drops the cached reading when it is latched, rather than serving a stale yes', async () => {
      const redis = redisWith();
      const service = serviceWith(0.5, [{ total: '0.01' }], redis);

      expect(await service.allowsModelCall()).toBe(true);

      await service.markProviderExhausted();

      // Without clearing the cache this would still answer true for up to a
      // second - a second of calls to a provider that has already said no.
      expect(await service.allowsModelCall()).toBe(false);
    });
  });
});
