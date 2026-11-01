import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { type Request } from 'express';

import { IS_PUBLIC } from '../access/public.decorator.js';
import { TooManyRequestsError } from '../common/errors/index.js';

/**
 * Counts requests per client, and refuses in the shape every refusal has.
 *
 * Two changes to the stock guard.
 *
 * The tracker is the client address rather than a session, because there is
 * no session: one shared demo key means keying on the key would put every
 * visitor in one bucket, so one impatient reader would lock out the rest.
 * Behind a proxy this reads `X-Forwarded-For`, which is only as trustworthy
 * as the proxy that sets it - it is a blast-radius limiter, not an identity.
 *
 * And the refusal is a {@link TooManyRequestsError}, so the body is the same
 * `{ error: { code, message, requestId } }` every other failure has rather
 * than the library's own shape.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  /**
   * Skips the health endpoints.
   *
   * The platform's probe runs on a schedule and would eventually trip a
   * limit, and a demo that gets restarted because it rate-limited its own
   * health check is worse than one that is not rate-limited at all.
   *
   * @param context The request being handled.
   * @returns True to let the request through uncounted.
   */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    return isPublic || (await super.shouldSkip(context));
  }

  /**
   * Identifies the client a request came from.
   *
   * @param request The incoming request.
   * @returns The address to count against.
   */
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    const typed = request as unknown as Request;

    // `req.ip` honours Express's `trust proxy` setting, which `main.ts` turns
    // on only when TRUST_PROXY says there is a proxy in front. Without that,
    // a forwarded header is a client-supplied string and trusting it would
    // make the limit free to bypass.
    return Promise.resolve(typed.ip ?? typed.socket.remoteAddress ?? 'unknown');
  }

  /**
   * @throws {TooManyRequestsError} Always, carrying how long to wait.
   */
  protected override throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: { timeToBlockExpire: number },
  ): Promise<void> {
    // Rounded up, because a client told to wait zero seconds retries
    // immediately and is refused again.
    throw new TooManyRequestsError(Math.max(1, Math.ceil(throttlerLimitDetail.timeToBlockExpire)));
  }
}

/** Re-exported so a caller can catch the library's own type if it leaks. */
export { ThrottlerException };
