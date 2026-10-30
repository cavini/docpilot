import { type INestApplication } from '@nestjs/common';
import { type App } from 'supertest/types';

/**
 * Hands the Nest HTTP server to Supertest with a real type.
 *
 * `getHttpServer()` is declared as `any` because Nest supports several HTTP
 * adapters. Narrowing it once here keeps that `any` out of every test file.
 *
 * @param app The application under test.
 * @returns The underlying server, typed for Supertest.
 *
 * @example
 * ```ts
 * await request(httpServer(app)).get('/health').expect(200);
 * ```
 */
export function httpServer(app: INestApplication): App {
  return app.getHttpServer() as App;
}
