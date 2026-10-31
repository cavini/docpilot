import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { conversations, documents } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { httpServer } from '../support/http.js';

const CORPUS =
  '# Lumen\n\n## Authentication\n\nCall POST /auth/token for a token valid 3600 seconds.';

/** One parsed server-sent event from the stream. */
interface StreamPart {
  type: string;
  delta?: string;
  data?: { conversationId?: string; citations?: unknown[] };
}

/** Parses an SSE body into the parts it carried. */
function parseStream(body: string): StreamPart[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as StreamPart);
}

describe('chat and conversations (e2e)', () => {
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
    await db.execute(sql`truncate table ${conversations} cascade`);

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

  describe('POST /chat', () => {
    it('AC1, AC2, AC3: streams the conversation, then citations, then the answer', async () => {
      const { text, headers } = await request(httpServer(app))
        .post('/chat')
        .send({ question: 'How long is a token valid?' })
        .expect(200);

      expect(headers['content-type']).toMatch(/text\/event-stream/);

      const parts = parseStream(text);
      const startAt = parts.findIndex((part) => part.type === 'start');
      const conversationAt = parts.findIndex((part) => part.type === 'data-conversation');
      const citationsAt = parts.findIndex((part) => part.type === 'data-citations');
      const firstTextAt = parts.findIndex((part) => part.type === 'text-delta');

      // `start` first, and exactly once: data parts written before a message
      // has started belong to no message, and the client renders them as a
      // second, empty one.
      expect(startAt).toBe(0);
      expect(parts.filter((part) => part.type === 'start')).toHaveLength(1);
      expect(conversationAt).toBeGreaterThan(startAt);
      expect(citationsAt).toBeGreaterThan(conversationAt);
      expect(firstTextAt).toBeGreaterThan(citationsAt);
      expect(parts.filter((part) => part.type === 'text-delta').length).toBeGreaterThan(1);
    }, 60_000);

    it('AC10: rejects an empty question', async () => {
      const { body } = await request(httpServer(app))
        .post('/chat')
        .send({ question: '   ' })
        .expect(400);

      expect(body.error.code).toBe('invalid_request');
    }, 30_000);

    it('AC11: rejects a question beyond the limit before reaching the provider', async () => {
      await request(httpServer(app))
        .post('/chat')
        .send({ question: 'x'.repeat(5_000) })
        .expect(400);
    }, 30_000);

    it('rejects an unknown field rather than ignoring it', async () => {
      await request(httpServer(app))
        .post('/chat')
        .send({ question: 'hello', surprise: true })
        .expect(400);
    }, 30_000);

    it('rejects a conversation id that is not a uuid', async () => {
      await request(httpServer(app))
        .post('/chat')
        .send({ question: 'hello', conversationId: 'nope' })
        .expect(400);
    }, 30_000);

    it('answers a missing conversation with 404, not an error inside a 200', async () => {
      // Everything that can fail before the stream opens is a real status
      // code, because once it is open the status is already 200.
      const { body } = await request(httpServer(app))
        .post('/chat')
        .send({ question: 'hello', conversationId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);

      expect(body.error.code).toBe('not_found');
    }, 30_000);
  });

  describe('conversations', () => {
    it('AC3: the id in the stream resumes the conversation', async () => {
      const { text } = await request(httpServer(app))
        .post('/chat')
        .send({ question: 'How do I authenticate?' })
        .expect(200);

      const id = parseStream(text).find((part) => part.type === 'data-conversation')?.data
        ?.conversationId;

      expect(id).toBeDefined();

      const { body } = await request(httpServer(app))
        .get(`/conversations/${String(id)}`)
        .expect(200);

      expect(body.title).toBe('How do I authenticate?');
      expect(body.messages).toHaveLength(2);
    }, 60_000);

    it('lists conversations', async () => {
      const { body } = await request(httpServer(app)).get('/conversations').expect(200);

      expect(body.items.length).toBeGreaterThan(0);
      expect(body).toHaveProperty('nextCursor');
    }, 30_000);

    it('404s for a conversation that does not exist', async () => {
      await request(httpServer(app))
        .get('/conversations/00000000-0000-4000-8000-000000000000')
        .expect(404);
    }, 30_000);

    it('AC14: deletes a conversation', async () => {
      const { text } = await request(httpServer(app))
        .post('/chat')
        .send({ question: 'How do I authenticate?' })
        .expect(200);
      const id = parseStream(text).find((part) => part.type === 'data-conversation')?.data
        ?.conversationId;

      await request(httpServer(app))
        .delete(`/conversations/${String(id)}`)
        .expect(204);

      await request(httpServer(app))
        .get(`/conversations/${String(id)}`)
        .expect(404);
    }, 60_000);

    it('404s when deleting one that is already gone', async () => {
      await request(httpServer(app))
        .delete('/conversations/00000000-0000-4000-8000-000000000000')
        .expect(404);
    }, 30_000);
  });
});
