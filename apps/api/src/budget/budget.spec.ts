import { decideBudget, nextUtcMidnight, startOfUtcDay } from './budget.js';

/** Mid-afternoon, so a day boundary bug cannot hide behind a round number. */
const now = new Date('2026-11-01T15:42:07.512Z');

describe('startOfUtcDay', () => {
  it('returns midnight UTC of the same day', () => {
    expect(startOfUtcDay(now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('is idempotent at exactly midnight', () => {
    const midnight = new Date('2026-11-01T00:00:00.000Z');

    expect(startOfUtcDay(midnight).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('uses UTC rather than the server timezone', () => {
    // 23:30 in London on the last day of a month is already the next month in
    // some zones. The window must not move when the host does.
    const late = new Date('2026-11-30T23:30:00.000Z');

    expect(startOfUtcDay(late).toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });
});

describe('nextUtcMidnight', () => {
  it('returns tomorrow midnight', () => {
    expect(nextUtcMidnight(now).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('crosses a month boundary', () => {
    expect(nextUtcMidnight(new Date('2026-11-30T12:00:00Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('crosses a year boundary', () => {
    expect(nextUtcMidnight(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('is strictly after midnight, so a window that just opened lasts a day', () => {
    const midnight = new Date('2026-11-01T00:00:00.000Z');

    expect(nextUtcMidnight(midnight).getTime()).toBeGreaterThan(midnight.getTime());
  });
});

describe('decideBudget', () => {
  it('AC10: allows a real provider while spend is below the ceiling', () => {
    const status = decideBudget({ spentUsd: 0.12, budgetUsd: 0.5, now });

    expect(status.exhausted).toBe(false);
    expect(status.spentUsd).toBe(0.12);
    expect(status.budgetUsd).toBe(0.5);
    expect(status.resetsAt?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('AC11: stops at the ceiling, not after it', () => {
    // Exactly at the ceiling is spent. Allowing one more call at the limit is
    // how a ceiling becomes a suggestion.
    expect(decideBudget({ spentUsd: 0.5, budgetUsd: 0.5, now }).exhausted).toBe(true);
    expect(decideBudget({ spentUsd: 0.499_999, budgetUsd: 0.5, now }).exhausted).toBe(false);
  });

  it('AC11: stays exhausted once spend is past the ceiling', () => {
    expect(decideBudget({ spentUsd: 12.4, budgetUsd: 0.5, now }).exhausted).toBe(true);
  });

  it('treats an unreadable ledger as exhausted, not as zero spent', () => {
    // The failure this guards is a database blip quietly removing the only
    // thing between a public URL and my balance. The other default fails
    // towards a bill.
    const status = decideBudget({ spentUsd: null, budgetUsd: 0.5, now });

    expect(status.exhausted).toBe(true);
    expect(status.spentUsd).toBe(0);
  });

  it('has no ceiling when the budget is zero', () => {
    const status = decideBudget({ spentUsd: 999, budgetUsd: 0, now });

    expect(status.exhausted).toBe(false);
    expect(status.budgetUsd).toBe(0);
  });

  it('reports no reset time when there is no ceiling, rather than a misleading one', () => {
    // A reset time next to an unlimited budget reads as a limit that resets.
    expect(decideBudget({ spentUsd: 0, budgetUsd: 0, now }).resetsAt).toBeNull();
  });

  it('serves an unreadable ledger when there is no ceiling to enforce', () => {
    // Nothing to protect, so nothing to fail closed about.
    expect(decideBudget({ spentUsd: null, budgetUsd: 0, now }).exhausted).toBe(false);
  });
});
