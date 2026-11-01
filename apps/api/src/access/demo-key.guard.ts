import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { type Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { TooManyRequestsError, UnauthorizedError } from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';
import { AUTH_FAILURE_WINDOW_SECONDS, MAX_AUTH_FAILURES, authFailureKey } from './auth-failures.js';
import { DEMO_KEY_HEADER, matchesDemoKey } from './demo-key.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Requires the shared demo key on every request, and bounds guessing at it.
 *
 * **The key is a speed bump, not a boundary.** One shared secret pasted into
 * messages will be forwarded and eventually indexed; what it buys is that a
 * crawler which finds the URL cannot spend anything. What actually protects
 * the provider balance is the spend ceiling, enforced whether or not the
 * caller has the key.
 *
 * Opt-out rather than opt-in: everything is closed unless a handler carries
 * `@Public()`, so an endpoint added later is protected by default. An empty
 * `DEMO_API_KEY` turns the gate off entirely, which is the local default and
 * how the whole test suite runs.
 *
 * **Wrong keys are counted.** The request limiter runs after this guard, so
 * without a counter here nothing bounded how fast a key could be guessed -
 * measured at around a thousand attempts a second before this existed. The
 * count is kept here rather than handed to the limiter on purpose: a flood of
 * bad keys must not consume the allowance a real reader shares with it.
 */
@Injectable()
export class DemoKeyGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DemoKeyGuard.name);
  }

  /**
   * @param context The request being handled.
   * @returns True when the request may proceed.
   * @throws {UnauthorizedError} When the key is missing or wrong.
   * @throws {TooManyRequestsError} When too many wrong keys have been tried.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.env.DEMO_API_KEY === '') {
      return true;
    }

    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.headers[DEMO_KEY_HEADER];

    // The fast path costs nothing: a request with the right key never touches
    // Redis, so the counter is paid for only by the attempts it exists to
    // bound.
    if (
      matchesDemoKey(typeof supplied === 'string' ? supplied : undefined, this.env.DEMO_API_KEY)
    ) {
      return true;
    }

    const client = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    if ((await this.countFailure(client)) > MAX_AUTH_FAILURES) {
      this.logger.warn({ client }, 'too many wrong keys; refusing further attempts');

      throw new TooManyRequestsError(AUTH_FAILURE_WINDOW_SECONDS);
    }

    // Nothing about what arrived goes into the message: not the value, not
    // the length, not whether it was close. The only useful thing to say is
    // what is needed.
    throw new UnauthorizedError(
      `This demo requires a key. Send it in the ${DEMO_KEY_HEADER} header.`,
    );
  }

  /**
   * Records one wrong key and returns how many this client has tried.
   *
   * A Redis failure reads as "no failures yet", so an outage degrades to the
   * behaviour this had before the counter existed rather than locking
   * everyone out of a working demo.
   *
   * @param client The address to count against.
   * @returns The running count within the window.
   */
  private async countFailure(client: string): Promise<number> {
    const key = authFailureKey(client);

    try {
      const failures = await this.redis.incr(key);

      if (failures === 1) {
        // Only on the first, so a steady stream of attempts cannot keep
        // pushing the expiry out and live in the window for ever.
        await this.redis.expire(key, AUTH_FAILURE_WINDOW_SECONDS);
      }

      return failures;
    } catch (error) {
      this.logger.error({ err: error }, 'could not count a failed key attempt');

      return 0;
    }
  }
}
