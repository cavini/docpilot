import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { type Redis } from 'ioredis';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';
import { DAILY_WINDOW_SECONDS, RATE_LIMITS } from './rate-limit.constants.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/**
 * Per-client request limits, counted in Redis.
 *
 * Two of them on every route: a burst limit, which bounds how fast one client
 * may go, and a daily limit, which bounds how much one client may do at all.
 * Only the second bounds cost - a burst limit resets, so a determined client
 * can sit at it all day.
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
        // Two named throttlers, both applied to every route. A route that
        // costs more overrides them with a decorator; a route that says
        // nothing gets the read limits, which is the safe-but-loose default.
        throttlers: [
          {
            name: 'burst',
            limit: RATE_LIMITS.reads.burst,
            ttl: RATE_LIMITS.reads.burstWindowSeconds * 1_000,
          },
          {
            name: 'daily',
            limit: RATE_LIMITS.reads.daily,
            ttl: DAILY_WINDOW_SECONDS * 1_000,
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
