import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { type Redis } from 'ioredis';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';
import { RATE_LIMITS } from './rate-limit.constants.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/**
 * Per-client request limits, counted in Redis.
 *
 * Redis rather than memory because the count has to survive a restart and be
 * shared by however many processes are running. An in-memory count resets
 * every deploy, which is the moment someone is most likely to be hammering
 * the thing.
 *
 * The connection is the one the application already owns rather than a second
 * one of the library's making: two connections to the same Redis, configured
 * differently, is two sets of failure behaviour to reason about.
 *
 * The configured limit is the generous read limit. Routes that cost more
 * carry a decorator that tightens it - see `rate-limit.decorators.ts` - so a
 * route added without thinking about cost gets the safe-but-loose default
 * rather than no limit at all.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ENV, REDIS],
      useFactory: (env: Env, redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            limit: RATE_LIMITS.reads.limit,
            ttl: RATE_LIMITS.reads.ttlSeconds * 1_000,
          },
        ],
        storage: new ThrottlerStorageRedisService(redis),
        // Turned off wholesale for the test suite, which would otherwise trip
        // a limit on whichever spec happened to run last.
        skipIf: () => !env.RATE_LIMIT_ENABLED,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
