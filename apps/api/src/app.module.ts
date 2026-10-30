import { Module } from '@nestjs/common';

import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { HealthModule } from './health/health.module.js';
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
    DbModule,
    RedisModule,
    StorageModule,
    FeatureFlagsModule,
    HealthModule,
  ],
})
export class AppModule {}
