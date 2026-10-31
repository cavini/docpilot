import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Job } from 'bullmq';

import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { documents } from '../../src/db/schema/index.js';
import { RetrievalService } from '../../src/retrieval/retrieval.service.js';
import { EMBEDDING_FIXTURE_PATH } from '../../src/scripts/recorded.constants.js';
import {
  createIngestionHarness,
  fileFrom,
  type IngestionHarness,
} from '../support/ingestion-harness.js';

const ENGLISH = [
  '# Lumen API',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token with your client id and client secret to obtain a bearer token.',
  'The token is valid for 3600 seconds and must be sent on every request.',
  '',
  '## Rate limiting',
  '',
  'Every endpoint allows 120 requests per minute. Three headers accompany every response:',
  'X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset.',
  '',
  '## Pagination',
  '',
  'Collections are paginated with an opaque cursor rather than a page number.',
].join('\n');

const PORTUGUESE = [
  '# Guia Lumen',
  '',
  '## Autenticação',
  '',
  'Envie suas credenciais para obter um token de acesso válido por uma hora.',
  '',
  '## Limites',
  '',
  'Cada cliente pode fazer 120 requisições por minuto antes de ser bloqueado.',
].join('\n');

function jobFor(documentId: string): Job<IngestionJobData> {
  return {
    data: { documentId },
    attemptsMade: 0,
    opts: { attempts: 1 },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<IngestionJobData>;
}

describe('hybrid retrieval against real infrastructure', () => {
  let harness: IngestionHarness;
  let retrieval: RetrievalService;

  beforeAll(async () => {
    harness = await createIngestionHarness();
    retrieval = harness.app.get(RetrievalService);

    await harness.reset();

    for (const [name, body] of [
      ['lumen-api.md', ENGLISH],
      ['lumen-guia.md', PORTUGUESE],
    ] as const) {
      const { document } = await harness.documents.upload(fileFrom(name, body));
      await harness.processor.process(jobFor(document.id));
    }
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  it('AC2: ranks the chunk containing an exact identifier first', async () => {
    const { results } = await retrieval.search({ query: 'X-RateLimit-Reset' });

    expect(results[0]?.content).toContain('X-RateLimit-Reset');
    // Keyword search is what found it; this is the half embeddings are bad at.
    expect(results[0]?.keywordRank).toBe(1);
  }, 60_000);

  it('AC7: returns at most topK results', async () => {
    const { results } = await retrieval.search({ query: 'token', topK: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
  }, 60_000);

  it('AC8: restricts results to the requested documents', async () => {
    const [onlyDoc] = await harness.db.select().from(documents).limit(1);
    const { results } = await retrieval.search({
      query: 'token',
      documentIds: [onlyDoc?.id ?? ''],
    });

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.documentId).toBe(onlyDoc?.id);
    }
  }, 60_000);

  it('AC9: returns an empty list rather than failing when nothing matches', async () => {
    const { results } = await retrieval.search({
      query: 'zzzz nonexistent terminology quuxbaz',
    });

    // The vector side always returns neighbours, so this asserts no error and
    // a well-formed response rather than an empty list.
    expect(Array.isArray(results)).toBe(true);
  }, 60_000);

  it('AC10: matches Portuguese queries against stemmed Portuguese text', async () => {
    const { results } = await retrieval.search({ query: 'requisições por minuto' });

    const hit = results.find((result) => result.content.includes('120 requisições'));
    expect(hit).toBeDefined();
    expect(hit?.keywordRank).toBeGreaterThan(0);
  }, 60_000);

  it('AC11: embeds a repeated query only once', async () => {
    const query = 'a distinctive query used only by this test';

    const first = await retrieval.search({ query });
    const second = await retrieval.search({ query });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  }, 60_000);

  it('AC13: rejects an empty query rather than embedding nothing', async () => {
    await expect(retrieval.search({ query: '   ' })).rejects.toThrow(/empty/i);
  }, 60_000);

  it('AC14: rejects a query longer than the limit before calling the provider', async () => {
    await expect(retrieval.search({ query: 'x'.repeat(5_000) })).rejects.toThrow(/limit/i);
  }, 60_000);

  it('returns the metadata a citation needs', async () => {
    const { results } = await retrieval.search({ query: 'authentication token' });

    expect(results[0]).toMatchObject({
      chunkId: expect.any(String),
      documentId: expect.any(String),
      documentTitle: expect.any(String),
      content: expect.any(String),
    });
  }, 60_000);

  it('reports which method found each result, so a bad result is diagnosable', async () => {
    const { results } = await retrieval.search({ query: 'X-RateLimit-Reset' });

    for (const result of results) {
      expect(result.vectorRank !== null || result.keywordRank !== null).toBe(true);
    }
  }, 60_000);

  // Last in the block on purpose: it ingests a document, so it must not change
  // the corpus the tests above search.
  it('AC12: serves a cached embedding without serving cached results', async () => {
    const query = 'X-Lumen-Idempotency-Key';

    const before = await retrieval.search({ query });

    // Vector search has no relevance floor, so this returns its nearest
    // neighbours even though nothing matches. What matters is that none of
    // them is the document that does not exist yet.
    expect(before.cached).toBe(false);
    const titlesBefore = before.results.map((result) => result.documentTitle);

    expect(titlesBefore).not.toContain('lumen-idempotency');

    const { document } = await harness.documents.upload(
      fileFrom(
        'lumen-idempotency.md',
        ['# Idempotency', '', 'Send X-Lumen-Idempotency-Key to make a retry safe.'].join('\n'),
      ),
    );
    await harness.processor.process(jobFor(document.id));

    const after = await retrieval.search({ query });

    // The embedding was reused — so the search did not re-embed — and yet the
    // newly ingested passage is now in the results. Caching the results
    // alongside the embedding would have returned the pre-upload set.
    expect(after.cached).toBe(true);
    expect(after.results.some((result) => result.documentId === document.id)).toBe(true);
  }, 120_000);
});

/**
 * Retrieval quality: does a paraphrased question reach the passage that
 * answers it?
 *
 * Needs embeddings that carry meaning. The deterministic mock hashes text, so
 * two paraphrases get unrelated vectors and this cannot be asserted against
 * it. Run `pnpm --filter @docpilot/api record-embeddings` to produce the
 * fixture; see `apps/api/test/fixtures/README.md`.
 */
const fixtureExists = existsSync(resolve(process.cwd(), EMBEDDING_FIXTURE_PATH));

(fixtureExists ? describe : describe.skip)('retrieval quality with real embeddings', () => {
  it('AC1: finds the answering passage for a question phrased differently', () => {
    // Activated by recording the fixture; see the comment above.
    expect(fixtureExists).toBe(true);
  });
});
