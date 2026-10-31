import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { conversations } from '../../src/db/schema/index.js';
import { ConversationsService } from '../../src/chat/conversations.service.js';
import { httpServer } from '../support/http.js';
import { describeErrors, openApiDocument, responseValidator } from './openapi-validator.js';

describe('conversations match the published contract', () => {
  let app: INestApplication;
  let conversationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate table ${conversations} cascade`);

    // Built through the store rather than by streaming, because the shape
    // under test is the conversation's, not the stream's.
    const store = app.get(ConversationsService);
    const conversation = await store.open(undefined, 'How do I authenticate?');
    await store.appendTurn(conversation.id, 'How do I authenticate?', {
      content: 'With a bearer token [1].',
      outcome: 'complete',
      citations: [
        {
          n: 1,
          chunkId: '3f1b9c2e-0000-4000-8000-000000000000',
          documentId: '3f1b9c2e-0000-4000-8000-000000000001',
          documentTitle: 'lumen-api',
          headingPath: 'Lumen API > Authentication',
          pageStart: null,
          pageEnd: null,
          snippet: 'Call POST /auth/token…',
        },
      ],
      inputTokens: 100,
      outputTokens: 20,
    });

    conversationId = conversation.id;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('the conversation list matches its documented response', async () => {
    const validate = responseValidator('/conversations', 'get', '200');
    const { body } = await request(httpServer(app)).get('/conversations').expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('a conversation and its turns match their documented response', async () => {
    const validate = responseValidator('/conversations/{id}', 'get', '200');
    const { body } = await request(httpServer(app))
      .get(`/conversations/${conversationId}`)
      .expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('rejects a conversation missing its messages', () => {
    // Guards the guard: a schema accepting anything would make the tests above
    // pass while asserting nothing.
    const validate = responseValidator('/conversations/{id}', 'get', '200');

    expect(
      validate({
        id: '3f1b9c2e-0000-4000-8000-000000000000',
        title: 'x',
        createdAt: '2026-10-30T12:00:00.000Z',
        updatedAt: '2026-10-30T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects a message with an unknown role', () => {
    const validate = responseValidator('/conversations/{id}', 'get', '200');

    expect(
      validate({
        id: '3f1b9c2e-0000-4000-8000-000000000000',
        title: 'x',
        createdAt: '2026-10-30T12:00:00.000Z',
        updatedAt: '2026-10-30T12:00:00.000Z',
        messages: [
          {
            id: '3f1b9c2e-0000-4000-8000-000000000002',
            role: 'narrator',
            content: 'x',
            ordinal: 0,
            outcome: null,
            citations: [],
            createdAt: '2026-10-30T12:00:00.000Z',
          },
        ],
      }),
    ).toBe(false);
  });

  it('a 404 matches its documented error shape', async () => {
    const validate = responseValidator('/conversations/{id}', 'get', '404');
    const { body } = await request(httpServer(app))
      .get('/conversations/00000000-0000-4000-8000-000000000000')
      .expect(404);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('a rejected question matches the documented error shape', async () => {
    const validate = responseValidator('/chat', 'post', '400');
    const { body } = await request(httpServer(app))
      .post('/chat')
      .send({ question: '' })
      .expect(400);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('documents the chat stream as an event stream, not as JSON', () => {
    // A client generated from a spec that claimed application/json here would
    // try to parse the whole response as one object and hang.
    const content = openApiDocument.paths['/chat']?.post?.responses?.['200']?.content ?? {};

    expect(Object.keys(content)).toContain('text/event-stream');
    expect(Object.keys(content)).not.toContain('application/json');
  });
});
