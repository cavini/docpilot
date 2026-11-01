import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AgentModule } from './agent/agent.module.js';
import { BudgetModule } from './budget/budget.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { DbModule } from './db/db.module.js';
import { type Env } from './config/env.schema.js';
import { ENV } from './config/env.tokens.js';
import { ExtractionModule } from './extraction/extraction.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { HealthModule } from './health/health.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { WorkerModeModule } from './ingestion/worker-mode.module.js';
import { LlmModule } from './llm/llm.module.js';
import { RetrievalModule } from './retrieval/retrieval.module.js';
import { LoggerModule } from './observability/logger.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Root module of the HTTP application.
 *
 * Order matters for the first three: configuration is global and validated
 * before anything reads it, logging is set up next so that later modules can
 * log while they start, and the connection-owning modules come after.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CommonModule,
    // One Redis connection configuration for every queue in the application.
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ connection: { url: env.REDIS_URL } }),
    }),
    // Carries ingestion events from the processor to the progress gateway
    // without either knowing about the other.
    EventEmitterModule.forRoot(),
    DbModule,
    RedisModule,
    // After DbModule, because the ceiling is read from the usage ledger.
    BudgetModule,
    StorageModule,
    FeatureFlagsModule,
    HealthModule,
    LlmModule,
    AgentModule,
    ExtractionModule,
    IngestionModule,
    DocumentsModule,
    RetrievalModule,
    ChatModule,
  ],
})
export class AppModule {
  /**
   * Builds the application, saying whether this process consumes the queue.
   *
   * `main.ts` and `worker.ts` boot the same module tree and must answer this
   * differently, which no environment variable alone can express: with
   * `WORKER_MODE=separate`, the API enqueues and the worker consumes.
   *
   * This is the **only** supported way to build the application. Importing
   * `AppModule` bare leaves `RUN_WORKER` unprovided and fails at startup,
   * which is deliberate: the previous arrangement let a bare import boot
   * cleanly and never consume a job, and a loud failure is worth more than a
   * silent one.
   *
   * @param options Whether to run the ingestion worker here.
   */
  static forRoot(options: { runWorker: boolean }): DynamicModule {
    return {
      module: AppModule,
      imports: [WorkerModeModule.forRoot(options.runWorker)],
    };
  }
}
