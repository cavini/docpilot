import { createScriptedLanguageModel, type ScriptedResponse } from '@docpilot/testing';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Job } from 'bullmq';
import { sql } from 'drizzle-orm';

import { AppModule } from '../../src/app.module.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../../src/chat/chat.tokens.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents, llmUsage } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { fileFrom } from '../support/ingestion-harness.js';

const CORPUS = [
  '# Lumen API',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token with your client id and secret to obtain a bearer token.',
  '',
  '## Usage',
  '',
  'GET /usage returns your rate limit window. It requires a token.',
].join('\n');

const ENDPOINT = {
  method: 'POST',
  path: '/auth/token',
  summary: 'Exchange credentials for a bearer token.',
  authenticated: false,
};

/** Wraps items the way `Output.array` reads them back. */
function asArrayOutput(items: unknown): ScriptedResponse {
  return { text: JSON.stringify({ elements: items }) };
}

/** What the model should return, for one test. */
let script: ScriptedResponse[] = [asArrayOutput([ENDPOINT])];

/**
 * Extraction against a real corpus.
 *
 * What the unit tests cannot establish: that retrieval actually finds the
 * passages, that the citations point at chunks that exist, and that the usage
 * ledger gains a row.
 */
describe('extraction against real infrastructure', () => {
  let app: INestApplication;
  let db: Database;
  let extraction: ExtractionService;
  let documentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    })
      // Substituted so each test decides what comes back. A real provider
      // cannot be asked to fail validation and then succeed.
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
    extraction = app.get(ExtractionService);

    await db.execute(sql`truncate table ${documents} cascade`);

    const { document } = await app.get(DocumentsService).upload(fileFrom('lumen-api.md', CORPUS));
    await app.get(IngestionProcessor).process({
      data: { documentId: document.id },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: () => Promise.resolve(),
    } as unknown as Job<IngestionJobData>);

    documentId = document.id;
  }, 120_000);

  beforeEach(() => {
    script = [asArrayOutput([ENDPOINT])];
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC1: returns items validated against the schema', async () => {
    const result = await extraction.extract({ schema: 'api_endpoints' });

    expect(result.items).toEqual([ENDPOINT]);
  }, 90_000);

  it('AC8: citations point at chunks that exist', async () => {
    const result = await extraction.extract({ schema: 'api_endpoints' });

    expect(result.citations.length).toBeGreaterThan(0);

    for (const citation of result.citations) {
      expect(citation.chunkId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(citation.documentTitle).toBe('lumen-api');
    }
  }, 90_000);

  it('AC7: reads only the document it was pointed at', async () => {
    const result = await extraction.extract({ schema: 'api_endpoints', documentId });

    for (const citation of result.citations) {
      expect(citation.documentId).toBe(documentId);
    }
  }, 90_000);

  it('retrieves against the real corpus, not a canned list', async () => {
    // The passages it read are the ones the question is about.
    const result = await extraction.extract({
      schema: 'api_endpoints',
      query: 'authentication token',
    });

    expect(JSON.stringify(result.citations)).toContain('Authentication');
  }, 90_000);

  it('AC9: records what the extraction cost', async () => {
    const before = await db.select().from(llmUsage);

    await extraction.extract({ schema: 'api_endpoints' });

    const after = await db.select().from(llmUsage);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((row) => row.operation === 'structured')).toBe(true);
  }, 90_000);

  it('AC11: streams one event per completed item', async () => {
    const second = { ...ENDPOINT, method: 'GET', path: '/usage', authenticated: true };
    script = [asArrayOutput([ENDPOINT, second])];

    const events: Record<string, unknown>[] = [];

    for await (const event of extraction.stream({ schema: 'api_endpoints' })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['schema', 'item', 'item', 'done']);
  }, 90_000);

  it('AC12: every streamed item is complete', async () => {
    script = [asArrayOutput([ENDPOINT])];

    for await (const event of extraction.stream({ schema: 'api_endpoints' })) {
      if (event.type === 'item') {
        // Every field present, not a partially-arrived object.
        expect(Object.keys(event.item as object).sort()).toEqual([
          'authenticated',
          'method',
          'path',
          'summary',
        ]);
      }
    }
  }, 90_000);

  it('extracts the other registered schemas against the same corpus', async () => {
    const outline = { level: 2, heading: 'Authentication', gist: 'How to get a token.' };
    script = [asArrayOutput([outline])];

    const result = await extraction.extract({ schema: 'document_outline' });

    expect(result.items).toEqual([outline]);
  }, 90_000);
});
