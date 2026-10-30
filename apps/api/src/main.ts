import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
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

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.flushLogs();

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

  app
    .get(Logger)
    .log(
      `API listening on http://localhost:${String(env.API_PORT)} (docs at /${SWAGGER_PATH})`,
      'Bootstrap',
    );
}

void bootstrap();
