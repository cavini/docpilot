import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { chunks, documents } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { INGESTION_QUEUE } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';

/** Everything an ingestion test needs, wired against the real containers. */
export interface IngestionHarness {
  app: INestApplication;
  db: Database;
  documents: DocumentsService;
  processor: IngestionProcessor;
  queue: Queue;
  /** Removes every document, and the chunks that cascade from them. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Starts the application against the test containers.
 *
 * The processor is driven directly rather than through a running worker:
 * waiting on a background worker makes a test depend on timing, and a test
 * that sometimes passes is worse than one that does not exist. The processor
 * is the unit under test either way — the worker only decides *when* it runs.
 */
export async function createIngestionHarness(): Promise<IngestionHarness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const db = app.get<Database>(DATABASE);
  const queue = app.get<Queue>(getQueueToken(INGESTION_QUEUE));

  const reset = async (): Promise<void> => {
    await db.execute(sql`truncate table ${documents} cascade`);
    await queue.drain(true);
  };

  return {
    app,
    db,
    documents: app.get(DocumentsService),
    processor: app.get(IngestionProcessor),
    queue,
    reset,
    close: async () => {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await app.close();
    },
  };
}

/** Builds the multipart-style file object the service expects. */
export function fileFrom(
  name: string,
  contents: string | Uint8Array,
  mimetype = 'text/markdown',
): { originalname: string; mimetype: string; size: number; buffer: Buffer } {
  const buffer = typeof contents === 'string' ? Buffer.from(contents) : Buffer.from(contents);

  return { originalname: name, mimetype, size: buffer.length, buffer };
}

/** Reads a document's chunks in order. */
export async function chunksOf(db: Database, documentId: string) {
  return db.select().from(chunks).where(eq(chunks.documentId, documentId)).orderBy(chunks.ordinal);
}
