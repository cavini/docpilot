import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { ENV } from '../config/env.tokens.js';
import { type Env } from '../config/env.schema.js';

/** Header a caller or an upstream proxy can use to supply its own trace id. */
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Paths whose values are replaced with `[redacted]` before a log line is
 * written. Anything that can carry a credential belongs here: a leaked token
 * in a log aggregator is as serious as one in source control.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'err.config.headers.authorization',
];

/**
 * Structured request logging.
 *
 * Every log line carries a request id, so all the lines produced while serving
 * one request can be pulled together, and the same id is returned in error
 * responses. An inbound `x-request-id` is honoured so a trace survives a hop
 * from the web app or a proxy; otherwise one is generated.
 *
 * In development the output goes through pino-pretty for readability. Anywhere
 * else it stays newline-delimited JSON, which is what a log aggregator wants.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const supplied = req.headers[REQUEST_ID_HEADER];
            const id = (Array.isArray(supplied) ? supplied[0] : supplied) ?? randomUUID();

            // Echo it back so a caller can correlate without reading the body.
            res.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          // Health probes run every few seconds and would otherwise dominate
          // the log.
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url?.startsWith('/health') === true,
          },
          customProps: () => ({ service: env.DD_SERVICE, env: env.DD_ENV }),
          ...(env.NODE_ENV === 'development'
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                },
              }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggerModule {}
