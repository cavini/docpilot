import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { ErrorResponseDto } from './error-response.dto.js';

/**
 * What each documented failure status means, in terms a client can act on.
 *
 * Keyed by status rather than by error `code` because a status is what the
 * OpenAPI document is organised around. The `code` inside the body is the
 * stable thing to branch on, and {@link ErrorResponseDto} documents it.
 */
const DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Understood but not acceptable. `code` says which part; retrying unchanged will fail.',
  404: 'No such resource.',
  409: 'Conflicts with the resource’s current state.',
  413: 'Larger than `MAX_UPLOAD_MB`.',
  415: 'Not a type the API can read.',
  503: 'A dependency is unavailable. Retrying is reasonable.',
};

/**
 * Documents the failure responses an endpoint can return.
 *
 * Without this the published spec describes only the successes, so a generated
 * client has no type for an error and the description's promise of
 * `{ error: { code, message, requestId } }` is unverifiable. The contract
 * tests validate real error bodies against these schemas, so the promise is
 * checked rather than asserted.
 *
 * Each endpoint declares the statuses it actually produces rather than every
 * status the API can ever return, because "which errors can this call give
 * me" is the question a client is asking.
 *
 * @param statuses Failure statuses this endpoint can return.
 * @returns A decorator attaching one documented response per status.
 *
 * @example
 * ```ts
 * @Post(':id/retry')
 * @ApiErrors(404, 409)
 * retry() {}
 * ```
 */
export function ApiErrors(...statuses: number[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? 'The request failed.',
        type: ErrorResponseDto,
      }),
    ),
  );
}
