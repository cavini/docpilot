import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { DomainError, TooManyRequestsError } from '../errors/index.js';
import { type ErrorResponseDto } from '../http/error-response.dto.js';

/** Shape of the error payload a Nest `HttpException` carries. */
interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
}

/** Reads the request id that pino-http attached to the request. */
function requestIdOf(request: Request): string {
  const { id } = request as Request & { id?: unknown };
  return typeof id === 'string' || typeof id === 'number' ? String(id) : 'unknown';
}

/** Turns a Nest `HttpException` payload into a single message string. */
function messageOf(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  const body = response as HttpExceptionBody;

  if (Array.isArray(body.message)) {
    return body.message.join('; ');
  }

  return body.message ?? body.error ?? exception.message;
}

/**
 * Translates every uncaught exception into the one error shape the API
 * promises: `{ error: { code, message, requestId } }`.
 *
 * Three cases are handled differently on purpose:
 *
 * - A {@link DomainError} is expected. Its code, status and details are
 *   returned as-is, and it is logged at `warn`.
 * - An `HttpException` comes from Nest itself, usually from DTO validation.
 *   Its status is kept and its code derived from the status name.
 * - Anything else is a bug. The client gets a generic `internal_error` with no
 *   detail, because an unexpected error's message can contain internals, while
 *   the full error and stack go to the log at `error` level.
 *
 * In every case the response carries the request id, so a user-visible failure
 * can be traced to its log lines.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  /** Maps `exception` onto the HTTP response. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = requestIdOf(request);

    const { status, body } = this.describe(exception, requestId);

    if (exception instanceof TooManyRequestsError) {
      // The standard header, so a client with no knowledge of this API's
      // error shape still backs off correctly.
      response.setHeader('Retry-After', exception.retryAfterSeconds);
    }

    response.status(status).json(body);
  }

  /** Chooses the status, response body and log level for `exception`. */
  private describe(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ErrorResponseDto } {
    if (exception instanceof DomainError) {
      this.logger.warn(
        { err: exception, code: exception.code, requestId },
        'request failed with a domain error',
      );

      return {
        status: exception.httpStatus,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            requestId,
            ...(exception.details ? { details: { ...exception.details } } : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = (HttpStatus[status] ?? 'http_error').toLowerCase();

      this.logger.warn({ err: exception, status, requestId }, 'request rejected');

      return {
        status,
        body: { error: { code, message: messageOf(exception), requestId } },
      };
    }

    // Unexpected: the message may expose internals, so it is logged and not
    // returned.
    this.logger.error({ err: exception, requestId }, 'unhandled exception');

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred.',
          requestId,
        },
      },
    };
  }
}
