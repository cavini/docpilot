import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { INGESTION_QUEUE } from './ingestion.constants.js';
import { IngestionProcessor } from './ingestion.processor.js';
import { ParserRegistry, PdfParser, TextParser } from './parsers/index.js';
import { IngestionProgressGateway } from './progress.gateway.js';
import { TokenizerService } from './tokenizer/tokenizer.service.js';

/**
 * The ingestion pipeline: parse, chunk, embed, store, and report progress.
 *
 * The queue is always registered, because anything that uploads a document
 * needs to put work on it. The **processor** is registered only when
 * `WORKER_MODE` says this process should run one, which is what lets the same
 * codebase be an API, a worker, or both:
 *
 * - `inline` — processors run here. One service to deploy, which is what the
 *   demo runs on.
 * - `separate` — this process only enqueues; `src/worker.ts` consumes.
 * - `off` — nothing processes. Used by tests that only need the HTTP API.
 */
@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: INGESTION_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) => ({
        defaultJobOptions: {
          // Three attempts with exponential backoff: enough to ride out a rate
          // limit or a provider blip, few enough that a genuinely broken
          // document fails quickly rather than retrying all day.
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          // Keep a short history so a failure can be inspected, without the
          // queue growing without bound.
          removeOnComplete: { age: 3_600, count: 100 },
          removeOnFail: { age: 86_400, count: 100 },
        },
        ...(env.WORKER_MODE === 'inline' || env.WORKER_MODE === 'separate' ? {} : { settings: {} }),
      }),
    }),
  ],
  providers: [
    PdfParser,
    TextParser,
    ParserRegistry,
    TokenizerService,
    IngestionProgressGateway,
    IngestionProcessor,
  ],
  exports: [BullModule, ParserRegistry, TokenizerService, IngestionProcessor],
})
export class IngestionModule {}
