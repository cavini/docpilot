import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createScriptedLanguageModel, type ScriptedResponse } from '@docpilot/testing';
import { type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { APPROVAL_REQUIRED_TOOL } from '../../src/agent/agent.service.js';
import { STEP_LIMIT_NOTICE } from '../../src/agent/agent.prompt.js';
import { AppModule } from '../../src/app.module.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../../src/chat/chat.tokens.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { conversations, documents, tickets } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { httpServer } from '../support/http.js';

const CORPUS =
  '# Lumen\n\n## Webhooks\n\nVerify the X-Lumen-Signature header against the raw body.';

/** One parsed server-sent event. */
interface StreamPart {
  type: string;
  approvalId?: string;
  toolName?: string;
  [key: string]: unknown;
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

/** What the model should do, for one test. */
let script: ScriptedResponse[] = [{ text: 'An answer.' }];

describe('agent (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    })
      // The model is substituted so each test decides what it does. A real
      // provider cannot be told to propose a ticket on demand, and the whole
      // point of these tests is what happens when it does.
      .overrideProvider(CHAT_MODEL_FACTORY)
      .useValue((() => ({
        model: createScriptedLanguageModel(script),
        provider: 'mock',
        modelId: 'mock-chat',
      })) satisfies ChatModelFactory)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    db = app.get<Database>(DATABASE);
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

  beforeEach(async () => {
    script = [{ text: 'An answer.' }];
    await db.execute(sql`truncate table ${tickets}`);
  });

  afterAll(async () => {
    await app.close();
  });

  /** How many tickets exist. The only evidence that counts. */
  async function ticketCount(): Promise<number> {
    const rows = await db.select().from(tickets);

    return rows.length;
  }

  it('answers without tools when the model does not ask for any', async () => {
    const { text } = await request(httpServer(app))
      .post('/agent')
      .send({ question: 'How do I verify a signature?' })
      .expect(200);

    const types = parseStream(text).map((part) => part.type);

    expect(types).toContain('text-delta');
    expect(types).not.toContain('tool-input-available');
  }, 60_000);

  it('AC2: shows the tool call and its result', async () => {
    script = [
      { text: '', toolCall: { toolName: 'search_docs', input: { query: 'signature' } } },
      { text: 'Verify it against the raw body [1].' },
    ];

    const { text } = await request(httpServer(app))
      .post('/agent')
      .send({ question: 'How do I verify a signature?' })
      .expect(200);

    const types = parseStream(text).map((part) => part.type);

    expect(types).toContain('tool-input-available');
    expect(types).toContain('tool-output-available');
  }, 60_000);

  it('AC7: proposes a ticket without creating one', async () => {
    // The whole guarantee: the stream carries an approval request and the
    // database is untouched.
    script = [
      {
        text: '',
        toolCall: {
          toolName: APPROVAL_REQUIRED_TOOL,
          input: { title: 'Document the retry schedule', body: 'It is not written down.' },
        },
      },
      { text: 'I have proposed a ticket.' },
    ];

    const { text } = await request(httpServer(app))
      .post('/agent')
      .send({ question: 'Open a ticket about the retry schedule' })
      .expect(200);

    const parts = parseStream(text);
    const approval = parts.find((part) => part.type === 'tool-approval-request');

    expect(approval).toBeDefined();
    expect(await ticketCount()).toBe(0);
  }, 60_000);

  it('create-ticket AC4: a stream ending with the approval unanswered creates nothing', async () => {
    // The default is always "did not happen".
    //
    // Denial proper - the reader answering no - needs the client to send an
    // approval response, which `useChat` does. That path is asserted in the
    // browser e2e; what is asserted here is the weaker and more dangerous
    // case, where nobody answers at all.
    script = [
      {
        text: '',
        toolCall: {
          toolName: APPROVAL_REQUIRED_TOOL,
          input: { title: 'Never approved', body: 'This must not exist.' },
        },
      },
      { text: 'Waiting for you.' },
    ];

    await request(httpServer(app)).post('/agent').send({ question: 'Open a ticket' }).expect(200);

    expect(await ticketCount()).toBe(0);
  }, 60_000);

  it('AC4: tells the reader it stopped when it runs out of steps', async () => {
    // Scripted to search for ever, which is the one thing a real model cannot
    // be relied on to do.
    script = [{ text: '', toolCall: { toolName: 'search_docs', input: { query: 'again' } } }];

    const { text } = await request(httpServer(app))
      .post('/agent')
      .send({ question: 'Keep going' })
      .expect(200);

    const parts = parseStream(text);
    const calls = parts.filter((part) => part.type === 'tool-input-available');

    expect(calls.length).toBeGreaterThan(0);

    // The turn ends rather than running until the request times out, and the
    // stored answer says so rather than being empty.
    const conversationId = parts.find((part) => part.type === 'data-conversation')?.data as
      { conversationId: string } | undefined;
    const { body } = await request(httpServer(app))
      .get(`/conversations/${String(conversationId?.conversationId)}`)
      .expect(200);

    const answer = (body.messages as { role: string; content: string; outcome: string }[]).find(
      (message) => message.role === 'assistant',
    );

    expect(answer?.content).toBe(STEP_LIMIT_NOTICE);
    expect(answer?.outcome).toBe('stopped');
  }, 90_000);

  it('rejects an empty question', async () => {
    const { body } = await request(httpServer(app))
      .post('/agent')
      .send({ question: '  ' })
      .expect(400);

    expect(body.error.code).toBe('invalid_request');
  }, 30_000);

  it('answers a missing conversation with 404', async () => {
    await request(httpServer(app))
      .post('/agent')
      .send({ question: 'hello', conversationId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  }, 30_000);
});
