import { SCHEMA_NAMES } from '@docpilot/shared';
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

const CORPUS = '# Lumen\n\n## Authentication\n\nCall POST /auth/token for a bearer token.';

/** Parses an SSE body into the events it carried. */
function parseStream(body: string): Record<string, unknown>[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

describe('extraction (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

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

  describe('GET /extract/schemas', () => {
    it('AC10: lists every registered schema with the fields a table needs', async () => {
      const { body } = await request(httpServer(app)).get('/extract/schemas').expect(200);

      expect(body.schemas.map((schema: { name: string }) => schema.name)).toEqual(SCHEMA_NAMES);

      for (const schema of body.schemas) {
        expect(schema.title.length).toBeGreaterThan(0);
        expect(schema.fields.length).toBeGreaterThan(0);
        expect(schema.fields[0]).toMatchObject({
          name: expect.any(String),
          kind: expect.any(String),
          label: expect.any(String),
        });
      }
    }, 30_000);

    it('gives an enum field its options, so a chooser can be built', async () => {
      const { body } = await request(httpServer(app)).get('/extract/schemas').expect(200);
      const endpoints = body.schemas.find(
        (schema: { name: string }) => schema.name === 'api_endpoints',
      );
      const method = endpoints.fields.find((field: { name: string }) => field.name === 'method');

      expect(method.options).toContain('POST');
    }, 30_000);
  });

  describe('POST /extract', () => {
    it('AC1: extracts with the mock provider, which is obviously canned', async () => {
      const { body } = await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'api_endpoints' })
        .expect(200);

      expect(body.schema).toBe('api_endpoints');
      expect(body.items.length).toBeGreaterThan(0);
      // The stub announces itself, so nobody mistakes it for extracted data.
      expect(JSON.stringify(body.items)).toContain('mock');
      expect(body).toMatchObject({ dropped: 0, repaired: false });
    }, 60_000);

    it('AC8: returns citations back to real passages', async () => {
      const { body } = await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'api_endpoints' })
        .expect(200);

      expect(body.citations.length).toBeGreaterThan(0);
      expect(body.citations[0]).toMatchObject({ n: 1, documentTitle: 'lumen' });
    }, 60_000);

    it('AC2: rejects an unknown schema and names the ones it knows', async () => {
      const { body } = await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'everything_please' })
        .expect(400);

      expect(body.error.code).toBe('invalid_request');
      expect(body.error.message).toContain('api_endpoints');
    }, 30_000);

    it('rejects a missing schema', async () => {
      await request(httpServer(app)).post('/extract').send({}).expect(400);
    }, 30_000);

    it('rejects an unknown field rather than ignoring it', async () => {
      await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'api_endpoints', surprise: true })
        .expect(400);
    }, 30_000);

    it('rejects a documentId that is not a uuid', async () => {
      await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'api_endpoints', documentId: 'nope' })
        .expect(400);
    }, 30_000);

    it('reports what it cost', async () => {
      const { body } = await request(httpServer(app))
        .post('/extract')
        .send({ schema: 'faq_pairs' })
        .expect(200);

      expect(body.usage).toMatchObject({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        costUsd: expect.any(Number),
      });
    }, 60_000);
  });

  describe('POST /extract/stream', () => {
    it('AC11: streams the schema, then items, then done', async () => {
      const { text, headers } = await request(httpServer(app))
        .post('/extract/stream')
        .send({ schema: 'api_endpoints' })
        .expect(200);

      expect(headers['content-type']).toMatch(/text\/event-stream/);

      const events = parseStream(text);

      expect(events[0]).toMatchObject({ type: 'schema', schema: 'api_endpoints' });
      expect(events.some((event) => event.type === 'item')).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: 'done' });
    }, 60_000);

    it('AC2: an unknown schema is a 400, not an error inside a 200', async () => {
      // Validated before anything is written, so the status is still the
      // server's to choose.
      const { body } = await request(httpServer(app))
        .post('/extract/stream')
        .send({ schema: 'nope' })
        .expect(400);

      expect(body.error.code).toBe('invalid_request');
    }, 30_000);
  });
});
