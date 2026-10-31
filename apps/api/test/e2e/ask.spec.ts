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

const CORPUS = [
  '# Lumen API',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token to obtain a bearer token valid for 3600 seconds.',
  '',
  '## Rate limiting',
  '',
  'Every endpoint allows 120 requests per minute, and the response carries',
  'X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset headers.',
].join('\n');

describe('search and ask (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate table ${documents} cascade`);

    const { document } = await app.get(DocumentsService).upload({
      originalname: 'lumen-api.md',
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

  describe('POST /search', () => {
    it('returns ranked passages with the metadata a citation needs', async () => {
      const { body } = await request(httpServer(app))
        .post('/search')
        .send({ query: 'X-RateLimit-Reset' })
        .expect(200);

      expect(body.results.length).toBeGreaterThan(0);
      expect(body.results[0]).toMatchObject({
        chunkId: expect.any(String),
        documentTitle: 'lumen-api',
        content: expect.any(String),
      });
      expect(body.tookMs).toEqual(expect.any(Number));
    });

    it('reports which method found each result', async () => {
      const { body } = await request(httpServer(app))
        .post('/search')
        .send({ query: 'X-RateLimit-Reset' })
        .expect(200);

      expect(body.results[0].keywordRank).toBe(1);
    });

    it('honours topK', async () => {
      const { body } = await request(httpServer(app))
        .post('/search')
        .send({ query: 'token', topK: 1 })
        .expect(200);

      expect(body.results).toHaveLength(1);
    });

    it('rejects an empty query', async () => {
      const { body } = await request(httpServer(app))
        .post('/search')
        .send({ query: '  ' })
        .expect(400);

      expect(body.error.code).toBe('invalid_request');
    });

    it('rejects a missing query', async () => {
      await request(httpServer(app)).post('/search').send({}).expect(400);
    });

    it('rejects an unknown field, rather than ignoring it', async () => {
      await request(httpServer(app))
        .post('/search')
        .send({ query: 'token', surprise: true })
        .expect(400);
    });

    it('rejects a topK above the allowed maximum', async () => {
      await request(httpServer(app))
        .post('/search')
        .send({ query: 'token', topK: 999 })
        .expect(400);
    });

    it('rejects a documentIds entry that is not a uuid', async () => {
      await request(httpServer(app))
        .post('/search')
        .send({ query: 'token', documentIds: ['nope'] })
        .expect(400);
    });
  });

  describe('POST /ask', () => {
    it('answers with citations resolved to real passages', async () => {
      const { body } = await request(httpServer(app))
        .post('/ask')
        .send({ question: 'How long is a token valid?' })
        .expect(200);

      expect(body.answer).toEqual(expect.any(String));
      expect(body.citations.length).toBeGreaterThan(0);
      expect(body.citations[0]).toMatchObject({
        n: 1,
        documentTitle: 'lumen-api',
        snippet: expect.any(String),
      });
    });

    it('reports what the answer cost', async () => {
      const { body } = await request(httpServer(app))
        .post('/ask')
        .send({ question: 'How long is a token valid?' })
        .expect(200);

      expect(body.usage).toMatchObject({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        costUsd: expect.any(Number),
      });
    });

    it('rejects an empty question', async () => {
      const { body } = await request(httpServer(app))
        .post('/ask')
        .send({ question: '   ' })
        .expect(400);

      expect(body.error.code).toBe('invalid_request');
    });

    it('rejects a question beyond the length limit before calling a provider', async () => {
      await request(httpServer(app))
        .post('/ask')
        .send({ question: 'x'.repeat(5_000) })
        .expect(400);
    });

    it('carries a request id on an error, so a failure can be traced', async () => {
      const { body } = await request(httpServer(app))
        .post('/ask')
        .send({ question: '' })
        .expect(400);

      expect(body.error.requestId).toEqual(expect.any(String));
    });
  });
});
