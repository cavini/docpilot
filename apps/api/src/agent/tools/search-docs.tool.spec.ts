import { type Env } from '../../config/env.schema.js';
import { type RetrievalService, type ScoredChunk } from '../../retrieval/index.js';
import { createSearchDocsTool, searchDocsInput } from './search-docs.tool.js';
import { isFailure } from './tool-result.js';

const env = { RETRIEVAL_TOP_K: 8 } as Env;

const chunk = (n: number): ScoredChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: `doc-${String(n)}`,
  documentTitle: 'lumen-api',
  content: `Passage ${String(n)}.`,
  headingPath: `Lumen API > Section ${String(n)}`,
  pageStart: null,
  pageEnd: null,
  score: 0.03,
  vectorRank: n,
  keywordRank: n,
});

/** Builds the tool with retrieval substituted. */
function createTool(options: { results?: ScoredChunk[]; throws?: Error } = {}) {
  const search = options.throws
    ? jest.fn().mockRejectedValue(options.throws)
    : jest.fn().mockResolvedValue({
        results: options.results ?? [chunk(1), chunk(2)],
        tookMs: 5,
        cached: false,
      });

  return { tool: createSearchDocsTool({ search } as unknown as RetrievalService, env), search };
}

/** Calls the tool's execute with the options the SDK supplies. */
async function run(tool: ReturnType<typeof createSearchDocsTool>, input: unknown) {
  return tool.execute(input as never, { toolCallId: 't1', messages: [] } as never);
}

describe('searchDocsInput', () => {
  it('AC5: rejects an empty query, rather than searching for nothing', () => {
    expect(searchDocsInput.safeParse({ query: '' }).success).toBe(false);
  });

  it('accepts a query on its own', () => {
    expect(searchDocsInput.safeParse({ query: 'authentication' }).success).toBe(true);
  });

  it('AC3: rejects a topK above the bound, so the model is told the limit', () => {
    expect(searchDocsInput.safeParse({ query: 'x', topK: 100 }).success).toBe(false);
  });

  it('rejects a documentId that is not a uuid', () => {
    expect(searchDocsInput.safeParse({ query: 'x', documentIds: ['nope'] }).success).toBe(false);
  });
});

describe('search_docs', () => {
  it('AC1: returns the passages retrieval found', async () => {
    const { tool } = createTool();

    const result = await run(tool, { query: 'authentication' });

    expect(result).toMatchObject({
      results: [
        { n: 1, chunkId: 'chunk-1', documentTitle: 'lumen-api' },
        { n: 2, chunkId: 'chunk-2' },
      ],
    });
  });

  it('AC6: numbers results from one, so the model can cite [n] directly', async () => {
    const { tool } = createTool();

    const result = (await run(tool, { query: 'x' })) as unknown as { results: { n: number }[] };

    expect(result.results.map((item) => item.n)).toEqual([1, 2]);
  });

  it('AC2: returns an empty list when nothing matches, not an error', async () => {
    // "Nothing found" is information the model can act on.
    const { tool } = createTool({ results: [] });

    expect(await run(tool, { query: 'nothing' })).toEqual({ results: [] });
  });

  it('AC3: passes topK through', async () => {
    const { tool, search } = createTool();

    await run(tool, { query: 'x', topK: 3 });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ topK: 3 }));
  });

  it('falls back to the configured topK when the model does not say', async () => {
    const { tool, search } = createTool();

    await run(tool, { query: 'x' });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ topK: 8 }));
  });

  it('AC4: passes the document filter through', async () => {
    const { tool, search } = createTool();
    const id = '3f1b9c2e-0000-4000-8000-000000000000';

    await run(tool, { query: 'x', documentIds: [id] });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentIds: [id] }));
  });

  it('returns a structured failure when retrieval throws, rather than ending the turn', async () => {
    const { tool } = createTool({ throws: new Error('pgvector is down') });

    const result = await run(tool, { query: 'x' });

    expect(isFailure(result)).toBe(true);
    expect(result).toMatchObject({ code: 'unavailable', message: expect.stringContaining('down') });
  });

  it('carries the metadata a citation needs', async () => {
    const { tool } = createTool();

    const result = (await run(tool, { query: 'x' })) as unknown as {
      results: Record<string, unknown>[];
    };

    expect(result.results[0]).toEqual({
      n: 1,
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      documentTitle: 'lumen-api',
      headingPath: 'Lumen API > Section 1',
      pageStart: null,
      pageEnd: null,
      content: 'Passage 1.',
    });
  });
});
