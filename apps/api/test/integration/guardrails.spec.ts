import { budgetExhausted } from '@docpilot/testing';
import { type Redis } from 'ioredis';

import { BudgetService } from '../../src/budget/index.js';
import { REDIS } from '../../src/redis/redis.tokens.js';

import { documents } from '../../src/db/schema/index.js';
import {
  createIngestionHarness,
  fileFrom,
  type IngestionHarness,
} from '../support/ingestion-harness.js';

const DOC = ['# Billing', '', 'The billing API creates invoices and records payments.'].join('\n');

/** A document whose bytes differ, so deduplication does not absorb it. */
const docNumber = (n: number): string => `${DOC}\n\nDocument number ${String(n)}.`;

describe('guardrails against real infrastructure', () => {
  describe("when the day's spend ceiling has been reached", () => {
    let harness: IngestionHarness;

    beforeAll(async () => {
      harness = await createIngestionHarness({ budget: budgetExhausted() });
    }, 90_000);

    beforeEach(async () => {
      await harness.reset();
    });

    afterAll(async () => {
      await harness.close();
    });

    it('AC12: refuses an upload rather than embedding it with the mock', async () => {
      await expect(harness.documents.upload(fileFrom('billing.md', DOC))).rejects.toMatchObject({
        code: 'budget_exhausted',
        httpStatus: 503,
      });
    });

    it('AC12: leaves no row behind when it refuses', async () => {
      await expect(harness.documents.upload(fileFrom('billing.md', DOC))).rejects.toThrow();

      // A refused upload that still inserted a row would show in the library
      // as a document stuck in `queued` forever.
      const held = await harness.db.select().from(documents);

      expect(held).toHaveLength(0);
    });

    it('AC12: says when it will work again, rather than just refusing', async () => {
      await expect(harness.documents.upload(fileFrom('billing.md', DOC))).rejects.toMatchObject({
        details: { resetsAt: '2026-11-02T00:00:00.000Z' },
      });
    });

    it('AC12: still returns a document that was already ingested', async () => {
      // Nothing is embedded and no row is added, so the ceiling does not
      // apply. Refusing here would make the demo lose documents it already
      // has, which is a worse failure than the one being guarded.
      const allowed = await createIngestionHarness();

      try {
        const { document } = await allowed.documents.upload(fileFrom('billing.md', DOC));
        const again = await harness.documents.upload(fileFrom('billing.md', DOC));

        expect(again.deduplicated).toBe(true);
        expect(again.document.id).toBe(document.id);
      } finally {
        await allowed.db.delete(documents);
        await allowed.close();
      }
    }, 90_000);
  });

  describe('when the corpus is full', () => {
    let harness: IngestionHarness;

    beforeAll(async () => {
      harness = await createIngestionHarness({ env: { MAX_DOCUMENTS: 2 } });
    }, 90_000);

    beforeEach(async () => {
      await harness.reset();
    });

    afterAll(async () => {
      await harness.close();
    });

    it('AC15: refuses the one past the limit and names the limit', async () => {
      await harness.documents.upload(fileFrom('one.md', docNumber(1)));
      await harness.documents.upload(fileFrom('two.md', docNumber(2)));

      await expect(
        harness.documents.upload(fileFrom('three.md', docNumber(3))),
      ).rejects.toMatchObject({ code: 'corpus_full', details: { limit: 2 } });
    });

    it('AC15: tells the reader what to do about it', async () => {
      await harness.documents.upload(fileFrom('one.md', docNumber(1)));
      await harness.documents.upload(fileFrom('two.md', docNumber(2)));

      await expect(harness.documents.upload(fileFrom('three.md', docNumber(3)))).rejects.toThrow(
        /Delete one before uploading another/,
      );
    });

    it('AC15: accepts again once something is deleted', async () => {
      const { document } = await harness.documents.upload(fileFrom('one.md', docNumber(1)));
      await harness.documents.upload(fileFrom('two.md', docNumber(2)));

      await harness.documents.remove(document.id);

      await expect(
        harness.documents.upload(fileFrom('three.md', docNumber(3))),
      ).resolves.toMatchObject({ deduplicated: false });
    });

    it('AC15: counts documents rather than refusing a repeat of one it holds', async () => {
      await harness.documents.upload(fileFrom('one.md', docNumber(1)));
      await harness.documents.upload(fileFrom('two.md', docNumber(2)));

      // The same bytes again add nothing to the count, so the limit has not
      // been reached by this request.
      await expect(
        harness.documents.upload(fileFrom('one.md', docNumber(1))),
      ).resolves.toMatchObject({ deduplicated: true });
    });
  });

  describe('with no ceilings configured', () => {
    let harness: IngestionHarness;

    beforeAll(async () => {
      harness = await createIngestionHarness();
    }, 90_000);

    beforeEach(async () => {
      await harness.reset();
    });

    afterAll(async () => {
      await harness.close();
    });

    it('accepts uploads, which is the local default', async () => {
      await expect(
        harness.documents.upload(fileFrom('one.md', docNumber(1))),
      ).resolves.toMatchObject({ deduplicated: false });
      await expect(
        harness.documents.upload(fileFrom('two.md', docNumber(2))),
      ).resolves.toMatchObject({ deduplicated: false });
    });
  });

  describe('when the provider says the balance is gone', () => {
    let harness: IngestionHarness;

    beforeAll(async () => {
      // A provider that could spend something. With the mock there is
      // nothing to protect, so the latch is deliberately never read - which
      // is correct, and makes this the wrong environment to test it in.
      harness = await createIngestionHarness({
        env: { LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-not-used', EMBEDDING_PROVIDER: 'mock' },
      });
    }, 90_000);

    beforeEach(async () => {
      await harness.reset();
      await harness.app.get(REDIS).del('docpilot:budget:provider-exhausted');
    });

    afterAll(async () => {
      await harness.app.get(REDIS).del('docpilot:budget:provider-exhausted');
      await harness.close();
    });

    it('latches, so later calls degrade instead of failing one by one', async () => {
      const budget = harness.app.get(BudgetService);

      expect(await budget.allowsModelCall()).toBe(true);

      await budget.markProviderExhausted();

      // Everything downstream already knows what to do with this: answering
      // falls back to the mock and says so, ingestion refuses at the door.
      expect(await budget.allowsModelCall()).toBe(false);
    });

    it('refuses an upload at the door rather than retrying into the same wall', async () => {
      await harness.app.get(BudgetService).markProviderExhausted();

      await expect(harness.documents.upload(fileFrom('billing.md', DOC))).rejects.toMatchObject({
        code: 'budget_exhausted',
      });
    });

    it('expires, so a top-up is picked up without a restart', async () => {
      const redis = harness.app.get<Redis>(REDIS);

      await harness.app.get(BudgetService).markProviderExhausted();

      // Set to expire with the spend window rather than kept for ever: a
      // demo that stayed degraded after being paid for would need somebody to
      // notice and redeploy.
      expect(await redis.ttl('docpilot:budget:provider-exhausted')).toBeGreaterThan(0);
    });
  });
});
