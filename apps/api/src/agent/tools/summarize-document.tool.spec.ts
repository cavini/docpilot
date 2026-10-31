import { createScriptedLanguageModel } from '@docpilot/testing';

import { type ChatModelFactory } from '../../chat/chat.tokens.js';
import { type Env } from '../../config/env.schema.js';
import { type Database } from '../../db/database.type.js';
import { type UsageService } from '../../llm/index.js';
import { SUMMARY_MAX_CHUNKS, createSummarizeDocumentTool } from './summarize-document.tool.js';
import { isFailure } from './tool-result.js';

const env = { MAX_OUTPUT_TOKENS: 1_024 } as Env;

const DOCUMENT_ID = '3f1b9c2e-0000-4000-8000-000000000000';

/** Builds a document row with the fields the tool reads. */
function document(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    title: 'lumen-billing',
    status: 'ready',
    chunkCount: 3,
    ...overrides,
  };
}

/** Builds chunk rows. */
function chunksOf(count: number) {
  return Array.from({ length: count }, (_, at) => ({
    id: `chunk-${String(at)}`,
    ordinal: at,
    content: `Passage ${String(at)}.`,
    headingPath: `Lumen billing > Section ${String(at)}`,
  }));
}

/**
 * A database stub that answers the two selects the tool makes, in order.
 *
 * Deliberately ordered rather than matched on the query: the tool reads the
 * document and then its chunks, and asserting that order is part of what this
 * substitute is for.
 */
function createDb(responses: unknown[][]) {
  let at = 0;
  const next = () => responses[Math.min(at++, responses.length - 1)] ?? [];

  const orderBy = jest.fn(() => Promise.resolve(next()));
  const where = jest.fn(() => Object.assign(Promise.resolve(next()), { orderBy }));
  const from = jest.fn(() => ({ where }));

  return { select: jest.fn(() => ({ from })) } as unknown as Database;
}

/** Builds the tool with everything substituted. */
function createTool(options: {
  doc?: Record<string, unknown>;
  chunkCount?: number;
  answers?: string[];
}) {
  const chunks = chunksOf(options.chunkCount ?? 3);
  const db = createDb([options.doc === undefined ? [] : [options.doc], chunks]);

  const model = createScriptedLanguageModel(
    (options.answers ?? ['A summary [1].']).map((text) => ({ text })),
  );
  const calls: string[] = [];
  const chatModel: ChatModelFactory = jest.fn(() => {
    calls.push('model');

    return { model, provider: 'mock', modelId: 'mock-chat' };
  });

  const record = jest.fn().mockResolvedValue(undefined);
  const usage = { record } as unknown as UsageService;

  return {
    tool: createSummarizeDocumentTool(db, chatModel, usage, env),
    model,
    record,
  };
}

/** Calls the tool's execute with the options the SDK supplies. */
async function run(tool: ReturnType<typeof createSummarizeDocumentTool>, input: unknown) {
  return tool.execute(input as never, { toolCallId: 't1', messages: [] } as never);
}

describe('summarize_document', () => {
  it('AC6: reports a document that does not exist, naming the id', async () => {
    // No document row at all, which is what a missing id looks like.
    const { tool } = createTool({});

    const result = await run(tool, { documentId: DOCUMENT_ID });

    expect(isFailure(result)).toBe(true);
    expect(result).toMatchObject({
      code: 'not_found',
      message: expect.stringContaining(DOCUMENT_ID),
    });
  });

  it('AC7: refuses a document that is not ready', async () => {
    // Summarising mid-ingestion summarises whichever passages happen to be
    // written and says nothing about the rest.
    const { tool } = createTool({ doc: document({ status: 'embedding' }) });

    const result = await run(tool, { documentId: DOCUMENT_ID });

    expect(result).toMatchObject({
      code: 'not_ready',
      message: expect.stringContaining('embedding'),
    });
  });

  it('AC8: refuses a document above the limit, saying how large it is', async () => {
    const { tool } = createTool({ doc: document({ chunkCount: SUMMARY_MAX_CHUNKS + 1 }) });

    const result = await run(tool, { documentId: DOCUMENT_ID });

    expect(result).toMatchObject({
      code: 'too_large',
      message: expect.stringContaining(String(SUMMARY_MAX_CHUNKS + 1)),
    });
  });

  it('refuses a ready document with no passages', async () => {
    const { tool } = createTool({ doc: document(), chunkCount: 0 });

    expect(await run(tool, { documentId: DOCUMENT_ID })).toMatchObject({ code: 'not_ready' });
  });

  it('AC3: skips the reduce step for a document that fits one prompt', async () => {
    // Eight chunks is one map step; a reduce would be a model call to rewrite
    // a summary of everything.
    const { tool, model } = createTool({ doc: document({ chunkCount: 8 }), chunkCount: 8 });

    await run(tool, { documentId: DOCUMENT_ID });

    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('AC2: runs map and reduce for a document that does not', async () => {
    const { tool, model } = createTool({ doc: document({ chunkCount: 20 }), chunkCount: 20 });

    await run(tool, { documentId: DOCUMENT_ID });

    // Three map steps over twenty chunks, then one reduce.
    expect(model.doGenerateCalls).toHaveLength(4);
  });

  it('AC1: reports every chunk as covered', async () => {
    const { tool } = createTool({ doc: document({ chunkCount: 12 }), chunkCount: 12 });

    const result = (await run(tool, { documentId: DOCUMENT_ID })) as unknown as {
      chunksCovered: number;
    };

    expect(result.chunksCovered).toBe(12);
  });

  it('AC4: returns citations back to the chunks behind the summary', async () => {
    const { tool } = createTool({ doc: document(), chunkCount: 3 });

    const result = (await run(tool, { documentId: DOCUMENT_ID })) as unknown as {
      citations: { n: number; chunkId: string; headingPath: string | null }[];
    };

    expect(result.citations).toEqual([
      { n: 1, chunkId: 'chunk-0', headingPath: 'Lumen billing > Section 0' },
      { n: 2, chunkId: 'chunk-1', headingPath: 'Lumen billing > Section 1' },
      { n: 3, chunkId: 'chunk-2', headingPath: 'Lumen billing > Section 2' },
    ]);
  });

  it('AC5: puts the focus in every map prompt, not only the reduce', async () => {
    // By the reduce step the detail a focus would select for has already been
    // discarded, so focusing at the end selects among summaries of the wrong
    // things.
    const { tool, model } = createTool({ doc: document({ chunkCount: 20 }), chunkCount: 20 });

    await run(tool, { documentId: DOCUMENT_ID, focus: 'the authentication parts' });

    const mapCalls = model.doGenerateCalls.slice(0, 3);

    for (const call of mapCalls) {
      expect(JSON.stringify(call.prompt)).toContain('the authentication parts');
    }
  });

  it('AC9: records every model call it makes', async () => {
    const { tool, record } = createTool({ doc: document({ chunkCount: 20 }), chunkCount: 20 });

    await run(tool, { documentId: DOCUMENT_ID });

    expect(record).toHaveBeenCalledTimes(4);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'agent' }));
  });

  it('returns the document title, so the model can name what it summarised', async () => {
    const { tool } = createTool({ doc: document() });

    const result = (await run(tool, { documentId: DOCUMENT_ID })) as unknown as {
      documentTitle: string;
    };

    expect(result.documentTitle).toBe('lumen-billing');
  });
});
