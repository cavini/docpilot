import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { UnauthorizedError } from '../common/errors/index.js';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { DEMO_KEY_HEADER, matchesDemoKey } from './demo-key.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Requires the shared demo key on every request.
 *
 * **This is a speed bump, not a boundary.** One shared secret pasted into
 * messages will be forwarded and eventually indexed; what it buys is that a
 * crawler which finds the URL cannot spend anything. What actually protects
 * the provider balance is the spend ceiling, which is enforced whether or not
 * the caller has the key.
 *
 * Opt-out rather than opt-in: everything is closed unless a handler carries
 * `@Public()`, so an endpoint added later is protected by default.
 *
 * An empty `DEMO_API_KEY` turns the gate off entirely, which is the local
 * default and how the whole test suite runs.
 */
@Injectable()
export class DemoKeyGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  /**
   * @param context The request being handled.
   * @returns True when the request may proceed.
   * @throws {UnauthorizedError} When the key is missing or wrong.
   */
  canActivate(context: ExecutionContext): boolean {
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

    if (
      matchesDemoKey(typeof supplied === 'string' ? supplied : undefined, this.env.DEMO_API_KEY)
    ) {
      return true;
    }

    // A domain error, so the global filter builds the same envelope it builds
    // for every other refusal. Nothing about what arrived goes into it: not
    // the value, not the length, not whether it was close.
    throw new UnauthorizedError(
      `This demo requires a key. Send it in the ${DEMO_KEY_HEADER} header.`,
    );
  }
}
