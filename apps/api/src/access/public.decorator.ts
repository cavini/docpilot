import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a handler as reachable without the demo key. */
export const IS_PUBLIC = 'docpilot:public';

/**
 * Marks a route as reachable without the demo key.
 *
 * Deliberately opt-**out**: the guard is global and everything is closed
 * unless a handler says otherwise, so a new endpoint added next year is
 * protected by default rather than by the author remembering.
 *
 * The only things marked public are the health endpoints, because the
 * platform's probe has no key and a demo that reports itself unhealthy is a
 * demo that gets restarted in a loop.
 *
 * @example
 * ```ts
 * @Public()
 * @Get('health/live')
 * live(): LivenessResponseDto { … }
 * ```
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
