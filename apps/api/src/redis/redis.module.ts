import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { REDIS } from './redis.tokens.js';

/**
 * Owns the shared Redis connection.
 *
 * Global for the same reason as the database module: the cache, the rate
 * limiter and the health check all need it.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Redis(env.REDIS_URL, {
          // Connect on the first command rather than on construction, so the
          // application graph can be built without Redis running. The OpenAPI
          // export relies on that, and a Redis outage then surfaces as a
          // failed command the health check can report, not a boot failure.
          lazyConnect: true,

          // The offline queue has to stay on alongside lazy connecting: it is
          // what holds the very first command while the connection is being
          // established. Turning it off makes that first command fail on every
          // fresh process, whether or not Redis is reachable.
          enableOfflineQueue: true,

          // What actually bounds a command during an outage, so a queued
          // command cannot wait for a reconnection that never comes.
          maxRetriesPerRequest: 2,
          connectTimeout: 5_000,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisModule.name);

    // ioredis emits `error` on every failed reconnection attempt. Without a
    // listener those become unhandled error events and crash the process, so a
    // Redis blip would take the API down instead of degrading it.
    this.redis.on('error', (error: Error) => {
      this.logger.warn({ err: error }, 'redis connection error');
    });
  }

  /**
   * Closes the connection as the process stops.
   *
   * `quit` sends a QUIT command and so needs a live connection. Because the
   * client connects lazily, a process that never touched Redis has none, and
   * `quit` would wait for a connection that is never made, hanging shutdown.
   * In that case the socket is dropped instead.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }

    this.logger.info('redis connection closed');
  }
}
