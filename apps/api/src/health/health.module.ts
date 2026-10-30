import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * Exposes `GET /health` and `GET /health/live`.
 *
 * The database and Redis clients come from their global modules; storage is
 * imported explicitly because its probe is a provider rather than a bare
 * connection.
 */
@Module({
  imports: [StorageModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
