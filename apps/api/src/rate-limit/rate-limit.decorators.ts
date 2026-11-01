import { Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from './rate-limit.constants.js';

/**
 * Applies the limit for calls that reach a model.
 *
 * Named after what the route costs rather than after a number, so changing
 * the number is one edit in {@link RATE_LIMITS} rather than a search for
 * every decorator that happened to use the old one.
 *
 * @example
 * ```ts
 * @AnswerRateLimit()
 * @Post('chat')
 * stream(...) { … }
 * ```
 */
export const AnswerRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({
    default: { limit: RATE_LIMITS.answers.limit, ttl: RATE_LIMITS.answers.ttlSeconds * 1_000 },
  });

/** Applies the limit for uploads, which cost embeddings, storage and CPU. */
export const UploadRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({
    default: { limit: RATE_LIMITS.uploads.limit, ttl: RATE_LIMITS.uploads.ttlSeconds * 1_000 },
  });
