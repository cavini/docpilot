import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { describeGuards } from './config/describe-guards.js';
import { loadDotenv } from './config/load-dotenv.js';
import { loadEnv } from './config/load-env.js';
import { startTracing } from './observability/tracing.js';
import { SWAGGER_PATH, setupSwagger } from './swagger.js';

/** Starts the HTTP application. */
async function bootstrap(): Promise<void> {
  // Validated first, so a configuration mistake stops the process here with a
  // readable message rather than surfacing later as an undefined value.
  // Fills in anything the environment does not already provide.
  loadDotenv();

  const env = loadEnv();

  // Must run before the instrumented modules are constructed.
  await startTracing(env);

  // With `separate`, a dedicated process consumes the queue instead.
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({ runWorker: env.WORKER_MODE === 'inline' }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.flushLogs();

  if (env.TRUST_PROXY) {
    // Only when something in front genuinely sets `X-Forwarded-For`. With
    // this on and no such proxy, the header is a client-supplied string and
    // every per-client limit becomes free to bypass by sending a new one.
    app.set('trust proxy', 1);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties no DTO declares, so an unexpected field is dropped
      // rather than carried into the application.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  // Lets the process finish in-flight requests and close its pools when the
  // container is asked to stop.
  app.enableShutdownHooks();

  setupSwagger(app);

  await app.listen(env.API_PORT);

  // Said at boot rather than discovered at the bill. Written as a sentence
  // rather than as fields because its reader is a person checking a
  // deployment, and "OPEN" has to be impossible to skim past.
  app.get(Logger).log(describeGuards(env), 'Bootstrap');

  app
    .get(Logger)
    .log(
      `API listening on http://localhost:${String(env.API_PORT)} (docs at /${SWAGGER_PATH})`,
      'Bootstrap',
    );
}

void bootstrap();
