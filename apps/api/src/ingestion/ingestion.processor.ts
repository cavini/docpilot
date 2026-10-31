import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { chunks, type DocumentRow, documents } from '../db/schema/index.js';
import { EmbedderService } from '../llm/index.js';
import { StorageService } from '../storage/storage.service.js';
import { chunkDocument, embeddingTextFor } from './chunker/index.js';
import { INGESTION_QUEUE, type IngestionJobData, STAGE_PROGRESS } from './ingestion.constants.js';
import { INGESTION_EVENT_CHANNEL, type IngestionEvent } from './ingestion.events.js';
import { detectLanguage, ParserRegistry, UnreadableDocumentError } from './parsers/index.js';
import { RUN_WORKER } from './worker.tokens.js';
import { TokenizerService } from './tokenizer/tokenizer.service.js';

/**
 * Turns an uploaded document into retrievable chunks.
 *
 * Runs as a BullMQ worker, so the slow and expensive part of ingestion is off
 * the request path and survives a restart: a job that was in flight when the
 * process died is handed to the next worker rather than lost.
 */
@Injectable()
@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
    private readonly parsers: ParserRegistry,
    private readonly tokenizer: TokenizerService,
    private readonly embedder: EmbedderService,
    private readonly events: EventEmitter2,
    @Inject(RUN_WORKER) private readonly runWorker: boolean,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(IngestionProcessor.name);
  }

  /**
   * Stops this process consuming the queue unless it is meant to.
   *
   * The provider is registered either way, so it stays injectable and
   * testable; only whether it picks work up is conditional.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.runWorker) {
      await this.worker.pause();
      this.logger.debug('ingestion worker registered but not consuming in this process');
      return;
    }

    this.logger.info({ concurrency: this.env.WORKER_CONCURRENCY }, 'ingestion worker consuming');
  }

  /**
   * Processes one document: parse, chunk, embed, store.
   *
   * A failure here is deliberately allowed to propagate. BullMQ retries with
   * backoff, and only when the attempts are exhausted is the document marked
   * `failed` — so a provider blip costs a retry rather than a document.
   *
   * @param job The queued job.
   * @throws Whatever went wrong, so BullMQ can decide whether to retry.
   */
  async process(job: Job<IngestionJobData>): Promise<void> {
    const { documentId } = job.data;
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!document) {
      // Deleted while queued. Nothing to do, and nothing worth failing over.
      this.logger.info({ documentId }, 'document no longer exists; skipping');
      return;
    }

    try {
      await this.run(document, job);
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const unreadable = error instanceof UnreadableDocumentError;

      // An unreadable file fails the same way every time, so retrying it only
      // delays the answer the user is waiting for.
      if (unreadable || isLastAttempt) {
        await this.fail(documentId, error);
      }

      throw error;
    }
  }

  /** The pipeline itself, with the stage transitions that make it watchable. */
  private async run(document: DocumentRow, job: Job<IngestionJobData>): Promise<void> {
    const startedAt = Date.now();

    await this.advance(document.id, 'parsing');
    const bytes = await this.storage.get(document.storageKey);
    const parsed = await this.parsers.parse(document.mimeType, bytes);
    const language = detectLanguage(parsed.text);

    await this.advance(document.id, 'chunking');
    const pieces = chunkDocument(parsed, {
      maxTokens: this.env.CHUNK_SIZE_TOKENS,
      overlapTokens: this.env.CHUNK_OVERLAP_TOKENS,
      countTokens: this.tokenizer.counter,
    });

    if (pieces.length === 0) {
      throw new UnreadableDocumentError('The document produced no text to index.');
    }

    await this.advance(document.id, 'embedding');
    // Embedded with the heading path attached; see `embeddingTextFor`.
    const embeddings = await this.embedder.embed(pieces.map(embeddingTextFor));
    await job.updateProgress(STAGE_PROGRESS.embedding);

    // Replace in one transaction: a crash part-way through must not leave a
    // document marked ready with half its chunks.
    await this.db.transaction(async (tx) => {
      await tx.delete(chunks).where(eq(chunks.documentId, document.id));
      await tx.insert(chunks).values(
        pieces.map((piece, index) => ({
          documentId: document.id,
          ordinal: piece.ordinal,
          content: piece.content,
          tokenCount: piece.tokenCount,
          headingPath: piece.headingPath,
          pageStart: piece.pageStart,
          pageEnd: piece.pageEnd,
          charStart: piece.charStart,
          charEnd: piece.charEnd,
          embedding: embeddings[index],
          language,
        })),
      );

      await tx
        .update(documents)
        .set({
          status: 'ready',
          progress: STAGE_PROGRESS.ready,
          error: null,
          language,
          pageCount: parsed.pageCount,
          chunkCount: pieces.length,
        })
        .where(eq(documents.id, document.id));
    });

    this.emit({
      type: 'completed',
      payload: {
        documentId: document.id,
        status: 'ready',
        chunkCount: pieces.length,
        pageCount: parsed.pageCount,
        language,
      },
    });

    this.logger.info(
      {
        documentId: document.id,
        chunks: pieces.length,
        pages: parsed.pageCount,
        language,
        durationMs: Date.now() - startedAt,
      },
      'document ingested',
    );
  }

  /** Moves the document to a stage and tells anyone watching. */
  private async advance(
    documentId: string,
    status: 'parsing' | 'chunking' | 'embedding',
  ): Promise<void> {
    const progress = STAGE_PROGRESS[status];

    await this.db.update(documents).set({ status, progress }).where(eq(documents.id, documentId));

    this.emit({ type: 'progress', payload: { documentId, status, progress } });
  }

  /** Records a terminal failure, with a reason a user can act on. */
  private async fail(documentId: string, error: unknown): Promise<void> {
    const message =
      error instanceof UnreadableDocumentError
        ? error.message
        : 'Ingestion failed. The document could not be processed.';

    await this.db
      .update(documents)
      .set({ status: 'failed', error: message })
      .where(eq(documents.id, documentId));

    this.emit({ type: 'failed', payload: { documentId, status: 'failed', error: message } });

    this.logger.error({ err: error, documentId }, 'ingestion failed');
  }

  /**
   * Publishes an event without knowing who, if anyone, is listening.
   *
   * Ingestion has no opinion about whether a browser is watching, which is
   * what lets the worker run in its own process.
   */
  private emit(event: IngestionEvent): void {
    this.events.emit(INGESTION_EVENT_CHANNEL, event);
  }
}
