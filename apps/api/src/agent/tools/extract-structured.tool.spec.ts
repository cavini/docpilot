import { createScriptedLanguageModel } from '@docpilot/testing';

import { type ChatModelFactory } from '../../chat/chat.tokens.js';
import { type Env } from '../../config/env.schema.js';
import { type UsageService } from '../../llm/index.js';
import { type RetrievalService, type ScoredChunk } from '../../retrieval/index.js';
import { createExtractStructuredTool, extractStructuredInput } from './extract-structured.tool.js';
import { isFailure } from './tool-result.js';

const env = { MAX_OUTPUT_TOKENS: 1_024 } as Env;

const chunk = (n: number): ScoredChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: 'doc-1',
  documentTitle: 'lumen-api',
  content: `POST /auth/token exchanges credentials for a token. Passage ${String(n)}.`,
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  score: 0.03,
  vectorRank: n,
  keywordRank: n,
});

const endpoint = {
  method: 'POST',
  path: '/auth/token',
  summary: 'Exchange credentials for a bearer token.',
  authenticated: false,
};

/** Builds the tool with everything substituted. */
function createTool(options: { results?: ScoredChunk[]; produced?: unknown } = {}) {
  const search = jest.fn().mockResolvedValue({
    results: options.results ?? [chunk(1), chunk(2)],
    tookMs: 5,
    cached: false,
  });

  // `Output.array` reads the model's text and parses it, so the scripted model
  // answers with the JSON a real one would be constrained into producing.
  const model = createScriptedLanguageModel([
    { text: JSON.stringify({ elements: options.produced ?? [endpoint] }) },
  ]);
  const chatModel: ChatModelFactory = jest.fn(() => ({
    model,
    provider: 'mock',
    modelId: 'mock-chat',
  }));

  const record = jest.fn().mockResolvedValue(undefined);

  return {
    tool: createExtractStructuredTool(
      { search } as unknown as RetrievalService,
      chatModel,
      { record } as unknown as UsageService,
      env,
    ),
    search,
    record,
  };
}

/** Calls the tool's execute with the options the SDK supplies. */
async function run(tool: ReturnType<typeof createExtractStructuredTool>, input: unknown) {
  return tool.execute(input as never, { toolCallId: 't1', messages: [] } as never);
}

describe('extractStructuredInput', () => {
  it('accepts a schema name', () => {
    expect(extractStructuredInput.safeParse({ schema: 'api_endpoints' }).success).toBe(true);
  });

  it('rejects an empty schema name', () => {
    expect(extractStructuredInput.safeParse({ schema: '' }).success).toBe(false);
  });

  it('rejects a documentId that is not a uuid', () => {
    expect(
      extractStructuredInput.safeParse({ schema: 'api_endpoints', documentId: 'nope' }).success,
    ).toBe(false);
  });
});

describe('extract_structured', () => {
  it('AC2: reports an unknown schema and lists the ones it knows', async () => {
    // Naming the alternatives, so the model's next attempt can succeed rather
    // than being another guess.
    const { tool } = createTool();

    const result = await run(tool, { schema: 'everything_please' });

    expect(isFailure(result)).toBe(true);
    expect(result).toMatchObject({
      code: 'invalid_input',
      message: expect.stringContaining('api_endpoints'),
    });
  });

  it('AC1: returns items that validate against the named schema', async () => {
    const { tool } = createTool();

    const result = (await run(tool, { schema: 'api_endpoints' })) as unknown as {
      items: unknown[];
    };

    expect(result.items).toEqual([endpoint]);
  });

  it('AC4: returns an empty list when nothing was retrieved, rather than inventing items', async () => {
    const { tool } = createTool({ results: [] });

    expect(await run(tool, { schema: 'api_endpoints' })).toMatchObject({ items: [], dropped: 0 });
  });

  it('AC3: returns a structured failure when the response does not match at all', async () => {
    // The SDK rejects a whole response that does not match the schema, and it
    // throws to do it. Returned rather than rethrown, so the model can try a
    // narrower query instead of the turn ending with nothing.
    const { tool } = createTool({ produced: [{ nothing: 'like an endpoint' }] });

    const result = await run(tool, { schema: 'api_endpoints' });

    expect(isFailure(result)).toBe(true);
    expect(result).toMatchObject({ code: 'unavailable' });
  });

  it('AC5: restricts retrieval to one document when asked', async () => {
    const { tool, search } = createTool();
    const documentId = '3f1b9c2e-0000-4000-8000-000000000000';

    await run(tool, { schema: 'api_endpoints', documentId });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentIds: [documentId] }));
  });

  it("uses the schema's default query when the model gives none", async () => {
    const { tool, search } = createTool();

    await run(tool, { schema: 'api_endpoints' });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('endpoints') }),
    );
  });

  it('AC6: returns citations back to the passages it read', async () => {
    const { tool } = createTool();

    const result = (await run(tool, { schema: 'api_endpoints' })) as unknown as {
      citations: { n: number; chunkId: string }[];
    };

    expect(result.citations).toEqual([
      { n: 1, chunkId: 'chunk-1' },
      { n: 2, chunkId: 'chunk-2' },
    ]);
  });

  it('AC7: records what the extraction cost', async () => {
    const { tool, record } = createTool();

    await run(tool, { schema: 'api_endpoints' });

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'structured' }));
  });
});
