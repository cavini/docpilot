import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { httpServer } from '../support/http.js';

import { AppModule } from '../../src/app.module.js';

describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('AC1: answers 200 when every dependency is reachable', async () => {
    const response = await request(httpServer(app)).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      dependencies: {
        database: { status: 'ok' },
        redis: { status: 'ok' },
        storage: { status: 'ok' },
      },
    });
  });

  it('AC2: reports a version and an ISO timestamp', async () => {
    const { body } = await request(httpServer(app)).get('/health').expect(200);

    expect(body.version).toEqual(expect.any(String));
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('AC3: answers liveness without probing any dependency', async () => {
    await request(httpServer(app)).get('/health/live').expect(200, { status: 'ok' });
  });

  it('AC4: returns the error envelope for an unknown route', async () => {
    const { body } = await request(httpServer(app)).get('/does-not-exist').expect(404);

    expect(body.error).toMatchObject({
      code: 'not_found',
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it('AC5: never leaks a stack trace to the client', async () => {
    const { text } = await request(httpServer(app)).get('/does-not-exist').expect(404);

    expect(text).not.toContain('at ');
  });

  it('AC6: lists the feature flags', async () => {
    const { body } = await request(httpServer(app)).get('/feature-flags').expect(200);

    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'rerank', enabled: expect.any(Boolean) }),
      ]),
    );
  });
});
