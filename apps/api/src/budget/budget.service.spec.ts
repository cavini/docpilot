import { type Env } from '../config/env.schema.js';
import { type Database } from '../db/database.type.js';
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

const envWith = (budget: number): Env => ({ DAILY_BUDGET_USD: budget }) as Env;

describe('BudgetService', () => {
  it('reports no ceiling when the budget is zero', () => {
    const { db } = dbReturning([]);

    expect(new BudgetService(envWith(0), db, logger).enforced).toBe(false);
    expect(new BudgetService(envWith(0.5), db, logger).enforced).toBe(true);
  });

  it('does not touch the ledger when there is no ceiling to enforce', async () => {
    const { db, calls } = dbReturning([{ total: '99' }]);
    const service = new BudgetService(envWith(0), db, logger);

    await expect(service.allowsModelCall()).resolves.toBe(true);

    // The local default and the whole test suite run this way. A query per
    // answered question, to enforce nothing, is a query not worth running.
    expect(calls()).toBe(0);
  });

  it('AC10: allows a call while the day is below the ceiling', async () => {
    const { db } = dbReturning([{ total: '0.1234' }]);
    const status = await new BudgetService(envWith(0.5), db, logger).status();

    expect(status).toMatchObject({ spentUsd: 0.1234, budgetUsd: 0.5, exhausted: false });
    expect(status.resetsAt).toBeInstanceOf(Date);
  });

  it('AC11: refuses once the day reaches the ceiling', async () => {
    const { db } = dbReturning([{ total: '0.5' }]);

    await expect(new BudgetService(envWith(0.5), db, logger).allowsModelCall()).resolves.toBe(
      false,
    );
  });

  it('reads the sum as a decimal string rather than as a float', async () => {
    // `numeric` comes back as a string precisely because summing these as
    // doubles drifts. A service that assumed a number would get NaN here.
    const { db } = dbReturning([{ total: '0.000123' }]);

    expect((await new BudgetService(envWith(1), db, logger).status()).spentUsd).toBe(0.000123);
  });

  it('treats an empty ledger as nothing spent', async () => {
    const { db } = dbReturning([]);
    const status = await new BudgetService(envWith(0.5), db, logger).status();

    expect(status.spentUsd).toBe(0);
    expect(status.exhausted).toBe(false);
  });

  it('treats an unreadable ledger as spent, not as zero', async () => {
    // The failure that matters: a database blip quietly removing the only
    // thing between a public URL and the provider balance.
    const { db } = dbReturning(new Error('connection terminated'));

    await expect(new BudgetService(envWith(0.5), db, logger).allowsModelCall()).resolves.toBe(
      false,
    );
  });

  it('reuses a reading rather than querying for every answered question', async () => {
    const { db, calls } = dbReturning([{ total: '0.1' }]);
    const service = new BudgetService(envWith(0.5), db, logger);

    await service.status();
    await service.status();
    await service.status();

    // The number cannot move far in a second, and one call costs a fraction
    // of a cent, so the staleness is bounded by what a second can spend.
    expect(calls()).toBe(1);
  });
});
