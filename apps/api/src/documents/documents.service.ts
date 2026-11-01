import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { BudgetService } from '../budget/index.js';
import {
  BudgetExhaustedError,
  ConflictError,
  CorpusFullError,
  NotFoundError,
} from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { type DocumentRow, documents } from '../db/schema/index.js';
import { INGESTION_QUEUE, type IngestionJobData } from '../ingestion/ingestion.constants.js';
import { StorageService } from '../storage/storage.service.js';
import { type UploadedFile, validateUpload } from './upload-validation.js';

/** A page of documents, newest first. */
export interface DocumentPage {
  items: DocumentRow[];
  /** Pass back as `cursor` to get the next page. Null when there are none. */
  nextCursor: string | null;
}

/** Result of an upload: the document, and whether it already existed. */
export interface UploadResult {
  document: DocumentRow;
  /** True when the same bytes had already been uploaded. */
  deduplicated: boolean;
}

/** How many documents a list returns when the caller does not say. */
const DEFAULT_PAGE_SIZE = 20;

/** The most a caller can ask for in one page. */
const MAX_PAGE_SIZE = 100;

/** Creates, lists and deletes documents, and queues them for ingestion. */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue<IngestionJobData>,
    private readonly logger: PinoLogger,
    private readonly budget: BudgetService,
  ) {
    this.logger.setContext(DocumentsService.name);
  }

  /**
   * Accepts a file, stores it, and queues it for ingestion.
   *
   * Uploading the same bytes twice returns the existing document rather than
   * creating a second one: people drag the same file in again, and
   * re-embedding it would cost money and put twin passages into retrieval
   * that crowd out other sources. A document that previously failed is the
   * exception — it is reprocessed, because the failure may have been
   * transient.
   *
   * The object is stored before the row is inserted. The reverse order would
   * leave a row pointing at bytes that were never written, which can never
   * succeed; this way a failure leaves an orphaned object, which is cleaned up
   * on the error path and is harmless if that cleanup also fails.
   *
   * @param file The uploaded file.
   * @returns The document, and whether it was deduplicated.
   * @throws {CorpusFullError} If the corpus already holds `MAX_DOCUMENTS`.
   * @throws {BudgetExhaustedError} If the day's spend ceiling is reached and
   *   this upload would need embedding.
   */
  async upload(file: UploadedFile): Promise<UploadResult> {
    const upload = validateUpload(file, this.env.MAX_UPLOAD_MB);

    const existing = await this.db.query.documents.findFirst({
      where: eq(documents.sha256, upload.sha256),
    });

    if (existing && existing.status !== 'failed') {
      // Already ingested. Nothing will be embedded and no row will be added,
      // so neither ceiling applies - the caller gets what is already there.
      this.logger.info({ documentId: existing.id }, 'upload deduplicated');
      return { document: existing, deduplicated: true };
    }

    if (existing) {
      // Same bytes, previously failed: reuse the row and try again. The row
      // already exists so the corpus cannot grow, but the retry re-embeds,
      // which costs.
      await this.assertWithinBudget();

      const retried = await this.enqueue(existing.id);
      return { document: retried, deduplicated: false };
    }

    await this.assertCorpusHasRoom();
    await this.assertWithinBudget();

    const [created] = await this.db
      .insert(documents)
      .values({
        title: upload.title,
        sourceFilename: upload.sourceFilename,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        sha256: upload.sha256,
        storageKey: 'pending',
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create the document row.');
    }

    const storageKey = StorageService.keyFor(created.id);

    try {
      await this.storage.put(storageKey, upload.bytes, upload.mimeType);
    } catch (error) {
      // The row would otherwise point at bytes that do not exist.
      await this.db.delete(documents).where(eq(documents.id, created.id));
      throw error;
    }

    const [stored] = await this.db
      .update(documents)
      .set({ storageKey })
      .where(eq(documents.id, created.id))
      .returning();

    await this.queue.add(INGESTION_QUEUE, { documentId: created.id }, { jobId: created.id });

    this.logger.info({ documentId: created.id, title: created.title }, 'document queued');

    return { document: stored ?? created, deduplicated: false };
  }

  /**
   * Lists documents, newest first.
   *
   * Keyset pagination on `createdAt` rather than an offset: an offset shifts
   * when a document is uploaded mid-listing, so a client paging through would
   * see a row twice or skip one.
   *
   * @param options Page size, and the cursor from a previous page.
   */
  async list(options: { limit?: number; cursor?: string } = {}): Promise<DocumentPage> {
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = options.cursor ? new Date(options.cursor) : undefined;

    const rows = await this.db
      .select()
      .from(documents)
      .where(cursor ? lt(documents.createdAt, cursor) : undefined)
      .orderBy(desc(documents.createdAt))
      // One extra row answers "is there another page" without a count query.
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    };
  }

  /**
   * Reads one document.
   *
   * @throws {NotFoundError} If it does not exist.
   */
  async get(id: string): Promise<DocumentRow> {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!document) {
      throw new NotFoundError('document', id);
    }

    return document;
  }

  /**
   * Deletes a document, its chunks and its stored original.
   *
   * Chunks go through the foreign key's cascade. Storage is cleared after the
   * row, because an orphaned object is harmless while a row pointing at
   * deleted bytes is not.
   *
   * @throws {NotFoundError} If it does not exist.
   */
  async remove(id: string): Promise<void> {
    const document = await this.get(id);

    await this.db.delete(documents).where(eq(documents.id, id));

    try {
      await this.storage.remove(document.storageKey);
    } catch (error) {
      // The document is gone as far as the user is concerned; a leftover
      // object is a cleanup problem, not a failed request.
      this.logger.warn(
        { err: error, documentId: id, storageKey: document.storageKey },
        'document deleted but its stored original could not be removed',
      );
    }

    this.logger.info({ documentId: id }, 'document deleted');
  }

  /**
   * Queues a failed document to be processed again.
   *
   * @throws {NotFoundError} If it does not exist.
   * @throws {ConflictError} If it has not failed; retrying a document that is
   *   queued or already ready would duplicate work or discard a good result.
   */
  async retry(id: string): Promise<DocumentRow> {
    const document = await this.get(id);

    if (document.status !== 'failed') {
      throw new ConflictError(
        `Only a failed document can be retried; this one is "${document.status}".`,
      );
    }

    return this.enqueue(id);
  }

  /** Resets a document to queued and puts it back on the queue. */
  private async enqueue(id: string): Promise<DocumentRow> {
    const [reset] = await this.db
      .update(documents)
      .set({ status: 'queued', progress: 0, error: null })
      .where(and(eq(documents.id, id)))
      .returning();

    // A job id of the document id makes enqueuing idempotent: a double click
    // cannot queue the same document twice.
    await this.queue.remove(id).catch(() => undefined);
    await this.queue.add(INGESTION_QUEUE, { documentId: id }, { jobId: id });

    if (!reset) {
      throw new NotFoundError('document', id);
    }

    return reset;
  }

  /**
   * Refuses when the corpus is already at its configured size.
   *
   * `MAX_UPLOAD_MB` covers one enormous file; this covers a thousand small
   * ones, which costs the same in embeddings and storage and is the easier of
   * the two to do by accident.
   *
   * @throws {CorpusFullError} If the ceiling is set and has been reached.
   */
  private async assertCorpusHasRoom(): Promise<void> {
    if (this.env.MAX_DOCUMENTS <= 0) {
      return;
    }

    const [row] = await this.db.select({ held: count() }).from(documents);

    if ((row?.held ?? 0) >= this.env.MAX_DOCUMENTS) {
      throw new CorpusFullError(this.env.MAX_DOCUMENTS);
    }
  }

  /**
   * Refuses when the day's spend ceiling has been reached.
   *
   * Ingestion refuses where answering degrades. A document embedded by the
   * mock would sit in the corpus returning confident nonsense for every
   * future search, and nothing in the interface would ever say so - degraded
   * output is disposable, degraded stored state is not.
   *
   * @throws {BudgetExhaustedError} If the ceiling has been reached.
   */
  private async assertWithinBudget(): Promise<void> {
    const status = await this.budget.status();

    if (status.exhausted) {
      this.logger.warn({ spentUsd: status.spentUsd }, 'upload refused: budget spent');
      throw new BudgetExhaustedError(status.resetsAt);
    }
  }
}
