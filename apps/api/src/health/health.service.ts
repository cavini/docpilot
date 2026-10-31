import { type HealthResponse, rollUpHealthStatus } from '@docpilot/shared';
import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { type Pool } from 'pg';

import { PG_POOL } from '../db/db.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';
import { StorageService } from '../storage/storage.service.js';
import { runProbe } from './probe.js';

/** Version reported by the health endpoint. */
const VERSION = process.env.DD_VERSION ?? '0.0.0';

/**
 * Reports whether the API and everything it depends on are usable.
 *
 * The three probes run concurrently, so the endpoint costs about as long as
 * the slowest dependency rather than the sum of all of them, and each is
 * bounded by its own timeout.
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  /**
   * Probes every dependency and rolls the results into one status.
   *
   * @returns The health of the API and each dependency. Never throws: a broken
   *   dependency is reported, not raised, because a health endpoint that fails
   *   tells the caller nothing about which part is broken.
   */
  async check(): Promise<HealthResponse> {
    const [database, redis, storage] = await Promise.all([
      // `select 1` is the cheapest statement that proves a connection can be
      // taken from the pool and that the server answers.
      runProbe(() => this.pool.query('select 1')),
      runProbe(() => this.redis.ping()),
      runProbe(() => this.storage.probe()),
    ]);

    const dependencies = { database, redis, storage };

    return {
      status: rollUpHealthStatus(Object.values(dependencies)),
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }
}
