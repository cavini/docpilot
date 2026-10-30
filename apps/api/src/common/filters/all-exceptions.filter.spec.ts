import { type ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { type PinoLogger } from 'nestjs-pino';

import { DependencyUnavailableError, NotFoundError } from '../errors/index.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const REQUEST_ID = 'req-123';

interface Captured {
  status: number;
  body: { error: { code: string; message: string; requestId: string; details?: unknown } };
}

/** Minimal express double that records what the filter wrote. */
function createHost(): { host: ArgumentsHost; captured: Captured } {
  const captured = { status: 0, body: {} } as Captured;

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured['body']) {
      captured.body = body;
      return this;
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: REQUEST_ID }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

function createLogger(): PinoLogger {
  return {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

describe('AllExceptionsFilter', () => {
  let logger: PinoLogger;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = createLogger();
    filter = new AllExceptionsFilter(logger);
  });

  it('AC1: maps a domain error to its own status and code', () => {
    const { host, captured } = createHost();

    filter.catch(new NotFoundError('document', 'abc'), host);

    expect(captured.status).toBe(404);
    expect(captured.body.error.code).toBe('not_found');
    expect(captured.body.error.message).toBe('document abc was not found');
  });

  it('AC2: includes the request id on every response', () => {
    const { host, captured } = createHost();

    filter.catch(new NotFoundError('document', 'abc'), host);

    expect(captured.body.error.requestId).toBe(REQUEST_ID);
  });

  it('AC3: returns the safe details a domain error carries', () => {
    const { host, captured } = createHost();

    filter.catch(new NotFoundError('document', 'abc'), host);

    expect(captured.body.error.details).toStrictEqual({ resource: 'document', id: 'abc' });
  });

  it('AC4: maps an unavailable dependency to 503, not 500', () => {
    const { host, captured } = createHost();

    filter.catch(new DependencyUnavailableError('database'), host);

    expect(captured.status).toBe(503);
    expect(captured.body.error.code).toBe('dependency_unavailable');
  });

  it('AC5: logs a domain error at warn, because it is expected', () => {
    const { host } = createHost();

    filter.catch(new NotFoundError('document', 'abc'), host);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('AC6: keeps the status of a nest http exception', () => {
    const { host, captured } = createHost();

    filter.catch(new NotFoundException('nope'), host);

    expect(captured.status).toBe(404);
    expect(captured.body.error.code).toBe('not_found');
  });

  it('AC7: joins the message array that dto validation produces', () => {
    const { host, captured } = createHost();

    filter.catch(
      new BadRequestException(['title must be a string', 'size must be positive']),
      host,
    );

    expect(captured.status).toBe(400);
    expect(captured.body.error.message).toBe('title must be a string; size must be positive');
  });

  it('AC8: maps an unexpected error to a generic 500', () => {
    const { host, captured } = createHost();

    filter.catch(new Error('connection string postgres://user:hunter2@host/db'), host);

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('internal_error');
  });

  it('AC9: never leaks the message of an unexpected error to the client', () => {
    const { host, captured } = createHost();

    filter.catch(new Error('connection string postgres://user:hunter2@host/db'), host);

    expect(JSON.stringify(captured.body)).not.toContain('hunter2');
  });

  it('AC10: logs an unexpected error at error level, with the error attached', () => {
    const { host } = createHost();
    const unexpected = new Error('boom');

    filter.catch(unexpected, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: unexpected, requestId: REQUEST_ID }),
      'unhandled exception',
    );
  });

  it('AC11: handles a thrown value that is not an Error at all', () => {
    const { host, captured } = createHost();

    filter.catch('just a string', host);

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('internal_error');
  });

  it('AC12: falls back to a placeholder when the request carries no id', () => {
    const captured = { status: 0, body: {} } as Captured;
    const response = {
      status(code: number) {
        captured.status = code;
        return this;
      },
      json(body: Captured['body']) {
        captured.body = body;
        return this;
      },
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => response }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundError('document', 'abc'), host);

    expect(captured.body.error.requestId).toBe('unknown');
  });
});
