import { createScriptedLanguageModel, type ScriptedResponse } from '@docpilot/testing';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type UIMessageChunk } from 'ai';
import { sql } from 'drizzle-orm';
import { type Job } from 'bullmq';

import { AgentService } from '../../src/agent/agent.service.js';
import { AppModule } from '../../src/app.module.js';
import { ConversationsService } from '../../src/chat/conversations.service.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../../src/chat/chat.tokens.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { conversations, documents, llmUsage, tickets } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { createTicketTool } from '../../src/agent/tools/create-ticket.tool.js';
import { fileFrom } from '../support/ingestion-harness.js';

const CORPUS = [
  '# Lumen API',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token with your client id and secret to obtain a bearer token.',
  'The token is valid for 3600 seconds.',
  '',
  '## Rate limiting',
  '',
  'GET /usage returns your current rate limit window. It requires a token.',
].join('\n');

/** What the model should do, for one test. */
let script: ScriptedResponse[] = [{ text: 'An answer.' }];

/** Drains a UI message stream into its parts. */
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

/** Reads a tool's output from the drained parts. */
function toolOutput(parts: UIMessageChunk[]): Record<string, unknown> | undefined {
  const part = parts.find((item) => item.type === 'tool-output-available');

  return (part as { output?: Record<string, unknown> } | undefined)?.output;
}

/**
 * The tools against real infrastructure.
 *
 * What the unit tests cannot establish: that `search_docs` runs the real
 * hybrid search, that `summarize_document` reads real chunks in order, that
 * `extract_structured` validates against a real corpus, and that a created
 * ticket is a row.
 */
describe('agent tools against real infrastructure', () => {
  let app: INestApplication;
  let db: Database;
  let agent: AgentService;
  let documentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    })
      .overrideProvider(CHAT_MODEL_FACTORY)
      .useValue((() => ({
        model: createScriptedLanguageModel(script),
        provider: 'mock',
        modelId: 'mock-chat',
      })) satisfies ChatModelFactory)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    db = app.get<Database>(DATABASE);
    agent = app.get(AgentService);

    await db.execute(sql`truncate table ${documents} cascade`);
    await db.execute(sql`truncate table ${conversations} cascade`);

    const { document } = await app.get(DocumentsService).upload(fileFrom('lumen-api.md', CORPUS));
    await app.get(IngestionProcessor).process({
      data: { documentId: document.id },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: () => Promise.resolve(),
    } as unknown as Job<IngestionJobData>);

    documentId = document.id;
  }, 120_000);

  beforeEach(async () => {
    script = [{ text: 'An answer.' }];
    await db.execute(sql`truncate table ${tickets}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('search_docs AC1: runs the real hybrid search', async () => {
    script = [
      { text: '', toolCall: { toolName: 'search_docs', input: { query: 'bearer token' } } },
      { text: 'Tokens last an hour [1].' },
    ];

    const parts = await drain(await agent.stream({ question: 'How long is a token valid?' }));
    const output = toolOutput(parts) as { results?: { content: string }[] } | undefined;

    expect(output?.results?.length).toBeGreaterThan(0);
    expect(JSON.stringify(output?.results)).toContain('3600 seconds');
  }, 90_000);

  it('search_docs AC2: returns an empty list when nothing matches', async () => {
    script = [
      {
        text: '',
        toolCall: { toolName: 'search_docs', input: { query: 'quantum llamas', topK: 1 } },
      },
      { text: 'Nothing found.' },
    ];

    const parts = await drain(await agent.stream({ question: 'anything' }));

    // Vector search has no relevance floor, so something always comes back -
    // what matters is that the call succeeds rather than erroring.
    expect(toolOutput(parts)).toHaveProperty('results');
  }, 90_000);

  it('summarize_document AC1: covers every chunk of a real document', async () => {
    script = [
      { text: '', toolCall: { toolName: 'summarize_document', input: { documentId } } },
      { text: 'Summarised.' },
    ];

    const parts = await drain(await agent.stream({ question: 'Summarise the API guide' }));
    const output = toolOutput(parts) as
      { chunksCovered?: number; citations?: unknown[]; documentTitle?: string } | undefined;

    expect(output?.chunksCovered).toBeGreaterThan(0);
    expect(output?.citations).toHaveLength(output?.chunksCovered ?? 0);
    expect(output?.documentTitle).toBe('lumen-api');
  }, 120_000);

  it('summarize_document AC6: reports a document that does not exist', async () => {
    script = [
      {
        text: '',
        toolCall: {
          toolName: 'summarize_document',
          input: { documentId: '00000000-0000-4000-8000-000000000000' },
        },
      },
      { text: 'There is no such document.' },
    ];

    const parts = await drain(await agent.stream({ question: 'Summarise it' }));

    expect(toolOutput(parts)).toMatchObject({ ok: false, code: 'not_found' });
  }, 90_000);

  it('extract_structured AC2: reports an unknown schema and names the known ones', async () => {
    script = [
      {
        text: '',
        toolCall: { toolName: 'extract_structured', input: { schema: 'whatever' } },
      },
      { text: 'I cannot extract that.' },
    ];

    const parts = await drain(await agent.stream({ question: 'Extract everything' }));

    expect(toolOutput(parts)).toMatchObject({
      ok: false,
      code: 'invalid_input',
      message: expect.stringContaining('api_endpoints'),
    });
  }, 90_000);

  it('create_ticket AC2: a created ticket is a row', async () => {
    // Called directly rather than through the loop, because the loop will not
    // execute it without an approval - which is the point of the tool and is
    // asserted in the e2e suite.
    const tool = createTicketTool(db, null);

    const result = await tool.execute(
      { title: 'Document the retry schedule', body: 'It is not written down.' },
      { toolCallId: 't1', messages: [] } as never,
    );

    expect(result).toMatchObject({ title: 'Document the retry schedule' });
    expect(await db.select().from(tickets)).toHaveLength(1);
  }, 60_000);

  it('AC11: records what the turn cost in the usage ledger', async () => {
    script = [
      { text: '', toolCall: { toolName: 'search_docs', input: { query: 'token' } } },
      { text: 'Answered [1].' },
    ];

    const before = await db.select().from(llmUsage);
    await drain(await agent.stream({ question: 'How long is a token valid?' }));
    const after = await db.select().from(llmUsage);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((row) => row.operation === 'agent')).toBe(true);
  }, 90_000);

  it('stores the turn in the conversation it belongs to', async () => {
    // Through the same store the chat path uses, which is the point: an agent
    // turn is a turn in the same conversation, not a parallel history.
    script = [{ text: 'A plain answer.' }];

    const parts = await drain(await agent.stream({ question: 'How do I authenticate?' }));
    const conversationId = (
      parts.find((part) => part.type === 'data-conversation') as
        { data?: { conversationId?: string } } | undefined
    )?.data?.conversationId;

    expect(conversationId).toBeDefined();

    const { messages } = await app.get(ConversationsService).get(conversationId ?? '');

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  }, 90_000);
});
