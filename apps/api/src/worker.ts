import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { loadEnv } from './config/load-env.js';
import { startTracing } from './observability/tracing.js';

/**
 * Starts the ingestion worker.
 *
 * The worker is a Nest application like the API, not a script: it needs the
 * same configuration validation, logging, database pool and services, and
 * building it as a Nest app means the queue processors can be unit tested with
 * `@nestjs/testing` exactly like a controller.
 *
 * It boots through `createApplicationContext` rather than `create`, so there
 * is no HTTP listener. Work arrives from the queue, not from a port.
 *
 * `WORKER_MODE` decides where processors run:
 *
 * - `inline` keeps them inside the API process. One service to deploy, which
 *   is what the demo runs on.
 * - `separate` expects this entrypoint as a second process, so ingestion load
 *   cannot slow down request handling.
 * - `off` disables processing, which tests use when they only need the HTTP
 *   API.
 *
 * Starting this entrypoint with any mode other than `separate` is a
 * configuration mistake worth failing on, rather than quietly idling.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();

  await startTracing(env);

  if (env.WORKER_MODE !== 'separate') {
    throw new Error(
      `The worker entrypoint requires WORKER_MODE=separate, but it is "${env.WORKER_MODE}". ` +
        'With "inline" the processors already run inside the API process.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.flushLogs();
  app.enableShutdownHooks();

  app
    .get(Logger)
    .log(`ingestion worker started with concurrency ${String(env.WORKER_CONCURRENCY)}`, 'Worker');
}

void bootstrap();
