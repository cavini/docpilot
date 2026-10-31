import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { httpServer } from '../support/http.js';
import { describeErrors, responseValidator } from './openapi-validator.js';

const CORPUS =
  '# Lumen\n\n## Authentication\n\nCall POST /auth/token for a token valid 3600 seconds.';

describe('search and ask match the published contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate table ${documents} cascade`);

    const { document } = await app.get(DocumentsService).upload({
      originalname: 'lumen.md',
      mimetype: 'text/markdown',
      size: Buffer.byteLength(CORPUS),
      buffer: Buffer.from(CORPUS),
    });

    await app.get(IngestionProcessor).process({
      data: { documentId: document.id },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: () => Promise.resolve(),
    } as unknown as Job<IngestionJobData>);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('a search response matches its documented shape', async () => {
    const validate = responseValidator('/search', 'post', '200');
    const { body } = await request(httpServer(app))
      .post('/search')
      .send({ query: 'authentication token' })
      .expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('an answer matches its documented shape', async () => {
    const validate = responseValidator('/ask', 'post', '200');
    const { body } = await request(httpServer(app))
      .post('/ask')
      .send({ question: 'How long is a token valid?' })
      .expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('the answer schema rejects a response missing its citations', () => {
    // Guards the guard: a schema accepting anything would make the test above
    // pass while asserting nothing.
    const validate = responseValidator('/ask', 'post', '200');

    expect(validate({ answer: 'text only' })).toBe(false);
  });

  it('the search schema rejects a result missing its ranks', () => {
    const validate = responseValidator('/search', 'post', '200');

    expect(validate({ results: [{ chunkId: 'x' }], tookMs: 1, cached: false })).toBe(false);
  });

  it('a rejected search matches the documented error shape', async () => {
    const validate = responseValidator('/search', 'post', '400');
    const { body } = await request(httpServer(app))
      .post('/search')
      .send({ query: ' ' })
      .expect(400);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('a rejected question matches the documented error shape', async () => {
    const validate = responseValidator('/ask', 'post', '400');
    const { body } = await request(httpServer(app)).post('/ask').send({ question: '' }).expect(400);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('the error schema rejects a body without a request id', () => {
    // Guards the guard. The request id is the whole point of the shape: it is
    // what connects a user-visible failure to its log lines.
    const validate = responseValidator('/ask', 'post', '400');

    expect(validate({ error: { code: 'invalid_request', message: 'no' } })).toBe(false);
  });
});
