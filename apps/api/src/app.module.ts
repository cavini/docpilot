import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { DbModule } from './db/db.module.js';
import { type Env } from './config/env.schema.js';
import { ENV } from './config/env.tokens.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { HealthModule } from './health/health.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { LlmModule } from './llm/llm.module.js';
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
    StorageModule,
    FeatureFlagsModule,
    HealthModule,
    LlmModule,
    IngestionModule,
    DocumentsModule,
  ],
})
export class AppModule {}
