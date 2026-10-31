import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { INGESTION_QUEUE } from '../../src/ingestion/ingestion.constants.js';
import { fileFrom } from '../support/ingestion-harness.js';

const CORPUS = [
  '# Lumen webhooks',
  '',
  '## Verifying a signature',
  '',
  'Every delivery carries an X-Lumen-Signature header: an HMAC-SHA256 of the raw body.',
].join('\n');

/**
 * Polls until `check` passes or the deadline expires.
 *
 * A background worker is asynchronous by definition, so the only honest way to
 * assert it ran is to wait for the outcome with a bound. The bound is what
 * stops a broken worker hanging the suite instead of failing it.
 */
async function until<T>(
  read: () => Promise<T>,
  check: (value: T) => boolean,
  timeoutMs = 60_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await read();

  while (!check(last) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    last = await read();
  }

  return last;
}

/**
 * Does an uploaded document actually get processed?
 *
 * Every other ingestion test calls `processor.process(job)` by hand, which
 * tests the processor and says nothing about whether anything ever hands it a
 * job. That gap hid a real bug: `RUN_WORKER` was declared inside
 * `IngestionModule`, so the processor resolved it from its own module and got
 * the hardcoded `false` no matter what the entrypoint passed. The queue was
 * never consumed in any process, and nothing failed — uploads simply sat in
 * `queued` for ever while every test passed.
 *
 * This is the only test in the suite that goes through the queue.
 */
describe('the ingestion worker consumes the queue', () => {
  let app: INestApplication;
  let db: Database;
  let queue: Queue;
  let service: DocumentsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: true })],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    db = app.get<Database>(DATABASE);
    queue = app.get<Queue>(getQueueToken(INGESTION_QUEUE));
    service = app.get(DocumentsService);

    await db.execute(sql`truncate table ${documents} cascade`);
    await queue.drain(true);
  }, 120_000);

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await app.close();
  });

  it('takes an uploaded document from queued to ready with no manual processing', async () => {
    const { document } = await service.upload(fileFrom('lumen-webhooks.md', CORPUS));

    expect(document.status).toBe('queued');

    const finished = await until(
      async () => {
        const [row] = await db.select().from(documents).where(eq(documents.id, document.id));

        return row;
      },
      (row) => row?.status === 'ready' || row?.status === 'failed',
    );

    expect(finished?.status).toBe('ready');
    expect(finished?.chunkCount).toBeGreaterThan(0);
  }, 90_000);

  it('leaves nothing waiting on the queue afterwards', async () => {
    expect(await queue.getWaitingCount()).toBe(0);
  }, 30_000);
});
