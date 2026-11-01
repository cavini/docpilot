import { Throttle } from '@nestjs/throttler';

import { DAILY_WINDOW_SECONDS, RATE_LIMITS, type RateLimitTier } from './rate-limit.constants.js';

/** Turns a tier into the two named throttlers every route carries. */
function tier(limits: RateLimitTier): Parameters<typeof Throttle>[0] {
  return {
    burst: { limit: limits.burst, ttl: limits.burstWindowSeconds * 1_000 },
    daily: { limit: limits.daily, ttl: DAILY_WINDOW_SECONDS * 1_000 },
  };
}

/**
 * Applies the limits for calls that reach a model.
 *
 * Named after what the route costs rather than after a number, so changing
 * the number is one edit in {@link RATE_LIMITS} rather than a search for
 * every decorator that happened to use the old one.
 *
 * @example
 * ```ts
 * @AnswerRateLimit()
 * @Post()
 * stream(...) { … }
 * ```
 */
export const AnswerRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle(tier(RATE_LIMITS.answers));

/** Applies the limits for uploads, which cost embeddings, storage and CPU. */
export const UploadRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle(tier(RATE_LIMITS.uploads));
