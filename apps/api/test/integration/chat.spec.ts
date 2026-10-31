import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Job, type Queue } from 'bullmq';
import { type UIMessageChunk } from 'ai';
import { eq, sql } from 'drizzle-orm';

import { AppModule } from '../../src/app.module.js';
import { ChatService } from '../../src/chat/chat.service.js';
import { ConversationsService } from '../../src/chat/conversations.service.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { conversations, documents, messages } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { INGESTION_QUEUE } from '../../src/ingestion/ingestion.constants.js';
import { fileFrom } from '../support/ingestion-harness.js';

const CORPUS = [
  '# Lumen API',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token with your client id and secret to obtain a bearer token.',
  'The token is valid for 3600 seconds.',
].join('\n');

/** Drains a UI message stream, returning its parts. */
async function drain(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const parts: UIMessageChunk[] = [];
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    parts.push(value);
  }

  return parts;
}

/**
 * Starts a turn and returns the conversation it landed in.
 *
 * The id arrives in the stream rather than in a header, so reading it means
 * draining the stream first — which these tests want to do anyway, since a
 * turn is only persisted once its stream has ended.
 */
async function ask(
  chat: ChatService,
  question: string,
  conversationId?: string,
): Promise<{ conversationId: string; parts: UIMessageChunk[] }> {
  const stream = await chat.stream({
    question,
    ...(conversationId === undefined ? {} : { conversationId }),
  });
  const parts = await drain(stream);
  const part = parts.find((item) => item.type === 'data-conversation');
  // `data` is `unknown` on a custom part, which is the SDK being honest: the
  // shape is this application's to define, so this is where it is asserted.
  const opened = (part as { data?: { conversationId?: string } } | undefined)?.data?.conversationId;

  if (opened === undefined) {
    throw new Error('the stream carried no conversation id');
  }

  return { conversationId: opened, parts };
}

/**
 * The chat path against a real database.
 *
 * What the unit tests cannot establish: that a turn actually lands in
 * Postgres with the right ordinals, that citations survive a round trip
 * through `jsonb`, and that deleting a conversation takes its messages with
 * it by foreign key rather than by application code remembering to.
 */
describe('chat against real infrastructure', () => {
  let app: INestApplication;
  let db: Database;
  let chat: ChatService;
  let store: ConversationsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    db = app.get<Database>(DATABASE);
    chat = app.get(ChatService);
    store = app.get(ConversationsService);

    await db.execute(sql`truncate table ${documents} cascade`);
    await db.execute(sql`truncate table ${conversations} cascade`);

    const { document } = await app.get(DocumentsService).upload(fileFrom('lumen-api.md', CORPUS));
    await app.get(IngestionProcessor).process({
      data: { documentId: document.id },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: () => Promise.resolve(),
    } as unknown as Job<IngestionJobData>);
  }, 120_000);

  afterAll(async () => {
    await app
      .get<Queue>(getQueueToken(INGESTION_QUEUE))
      .obliterate({ force: true })
      .catch(() => undefined);
    await app.close();
  });

  it('AC7: stores the turn, with the question before the answer', async () => {
    const { conversationId } = await ask(chat, 'How long is a token valid?');
    const { messages: turns } = await store.get(conversationId);

    expect(turns.map((turn) => [turn.ordinal, turn.role])).toEqual([
      [0, 'user'],
      [1, 'assistant'],
    ]);
    expect(turns[0]?.content).toBe('How long is a token valid?');
  }, 90_000);

  it('AC7: citations survive the round trip through jsonb', async () => {
    const { conversationId } = await ask(chat, 'How do I authenticate?');
    const { messages: turns } = await store.get(conversationId);
    const answer = turns.find((turn) => turn.role === 'assistant');

    expect(answer?.citations.length).toBeGreaterThan(0);
    expect(answer?.citations[0]).toMatchObject({
      n: expect.any(Number),
      chunkId: expect.any(String),
      documentTitle: expect.any(String),
      snippet: expect.any(String),
    });
  }, 90_000);

  it('AC5: appends a follow-up to the same conversation', async () => {
    const { conversationId } = await ask(chat, 'How do I authenticate?');

    await ask(chat, 'and the rate limit?', conversationId);

    const { messages: turns } = await store.get(conversationId);

    expect(turns.map((turn) => turn.ordinal)).toEqual([0, 1, 2, 3]);
    expect(turns[2]?.content).toBe('and the rate limit?');
  }, 120_000);

  it('rejects an unknown conversation before opening a stream', async () => {
    // A 404 the caller can act on, rather than an error part inside a 200.
    await expect(
      chat.stream({
        question: 'hello',
        conversationId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toThrow(/not found/i);
  }, 60_000);

  it('AC14: deleting a conversation takes its messages with it', async () => {
    const { conversationId } = await ask(chat, 'How do I authenticate?');

    await store.remove(conversationId);

    const left = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    // By foreign key, not by application code remembering to.
    expect(left).toEqual([]);
  }, 90_000);

  it('lists conversations most recently used first', async () => {
    const page = await store.list({ limit: 10 });
    const updated = page.items.map((item) => item.updatedAt.getTime());

    expect([...updated].sort((a, b) => b - a)).toEqual(updated);
  }, 60_000);
});
