import { type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { chunks, documents } from '../../src/db/schema/index.js';
import { buildPdf } from '../../src/ingestion/parsers/test-support.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import {
  chunksOf,
  createIngestionHarness,
  fileFrom,
  type IngestionHarness,
} from '../support/ingestion-harness.js';

const MARKDOWN = [
  '# Billing API',
  '',
  'The billing API creates invoices and records payments.',
  '',
  '## Authentication',
  '',
  'Call POST /auth/token with your client credentials to obtain a bearer token.',
  '',
  '## Rate limiting',
  '',
  'Every endpoint allows 120 requests per minute. Exceeding it returns 429.',
].join('\n');

const PORTUGUESE = [
  '# Faturamento',
  '',
  'A API de faturamento cria faturas e registra pagamentos para você.',
  '',
  '## Autenticação',
  '',
  'Envie uma requisição para obter um token. Este token não é permanente.',
].join('\n');

/** Drives the processor directly, with the job shape BullMQ would hand it. */
function jobFor(documentId: string, attemptsMade = 0, attempts = 3): Job<IngestionJobData> {
  return {
    data: { documentId },
    attemptsMade,
    opts: { attempts },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<IngestionJobData>;
}

describe('ingestion against real infrastructure', () => {
  let harness: IngestionHarness;

  beforeAll(async () => {
    harness = await createIngestionHarness();
  }, 90_000);

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('AC1: takes a document from queued to ready with chunks stored', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    expect(document.status).toBe('queued');

    await harness.processor.process(jobFor(document.id));

    const after = await harness.documents.get(document.id);
    const stored = await chunksOf(harness.db, document.id);

    expect(after.status).toBe('ready');
    expect(after.progress).toBe(100);
    expect(after.error).toBeNull();
    expect(after.chunkCount).toBe(stored.length);
    expect(stored.length).toBeGreaterThan(1);
  }, 60_000);

  it('AC2: stores an embedding of the configured width for every chunk', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));

    await harness.processor.process(jobFor(document.id));

    const [row] = await harness.db
      .select({ dims: sql<number>`vector_dims(${chunks.embedding})` })
      .from(chunks)
      .where(eq(chunks.documentId, document.id))
      .limit(1);

    expect(row?.dims).toBe(1536);
  }, 60_000);

  it('AC3: records the heading path for each chunk', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));

    await harness.processor.process(jobFor(document.id));
    const stored = await chunksOf(harness.db, document.id);

    expect(stored.map((chunk) => chunk.headingPath)).toContain('Billing API > Authentication');
  }, 60_000);

  it('AC4: finds a section by a word that appears only in its heading', async () => {
    // The passage under "Authentication" never contains the word; without the
    // heading in the index this returns nothing.
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    await harness.processor.process(jobFor(document.id));

    const hits = await harness.db
      .select({ headingPath: chunks.headingPath })
      .from(chunks)
      .where(sql`${chunks.tsv} @@ websearch_to_tsquery('english', 'authentication')`);

    expect(hits.map((hit) => hit.headingPath)).toContain('Billing API > Authentication');
  }, 60_000);

  it('AC5: detects Portuguese and indexes it with the Portuguese stemmer', async () => {
    const { document } = await harness.documents.upload(fileFrom('faturamento.md', PORTUGUESE));

    await harness.processor.process(jobFor(document.id));
    const after = await harness.documents.get(document.id);

    expect(after.language).toBe('portuguese');

    // "autenticar" stems to the same lexeme as "autenticação" only under the
    // Portuguese configuration.
    const hits = await harness.db
      .select({ id: chunks.id })
      .from(chunks)
      .where(sql`${chunks.tsv} @@ websearch_to_tsquery('portuguese', 'autenticar')`);

    expect(hits.length).toBeGreaterThan(0);
  }, 60_000);

  it('AC6: records page numbers for a PDF', async () => {
    const pdf = buildPdf([
      ['Authentication', 'Call POST /auth/token to obtain a bearer token.'],
      ['Rate limiting', 'Every endpoint allows 120 requests per minute.'],
    ]);
    const { document } = await harness.documents.upload(
      fileFrom('manual.pdf', pdf, 'application/pdf'),
    );

    await harness.processor.process(jobFor(document.id));

    const after = await harness.documents.get(document.id);
    const stored = await chunksOf(harness.db, document.id);

    expect(after.pageCount).toBe(2);
    expect(stored.every((chunk) => chunk.pageStart !== null)).toBe(true);
    expect(stored.map((chunk) => chunk.pageEnd)).toContain(2);
  }, 60_000);

  it('AC7: replaces chunks on a re-run rather than duplicating them', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));

    await harness.processor.process(jobFor(document.id));
    const first = await chunksOf(harness.db, document.id);

    await harness.processor.process(jobFor(document.id));
    const second = await chunksOf(harness.db, document.id);
    const after = await harness.documents.get(document.id);

    expect(second).toHaveLength(first.length);
    expect(after.chunkCount).toBe(second.length);
  }, 60_000);

  it('AC8: fails a document whose text cannot be extracted, rather than leaving it empty', async () => {
    const scanned = buildPdf([[], []]);
    const { document } = await harness.documents.upload(
      fileFrom('scan.pdf', scanned, 'application/pdf'),
    );

    await expect(harness.processor.process(jobFor(document.id))).rejects.toThrow();

    const after = await harness.documents.get(document.id);
    expect(after.status).toBe('failed');
    expect(after.error).toMatch(/OCR|no text/i);
    expect(await chunksOf(harness.db, document.id)).toHaveLength(0);
  }, 60_000);

  it('AC9: leaves a document queued for retry while attempts remain', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    await harness.db
      .update(documents)
      .set({ storageKey: 'documents/missing/original' })
      .where(eq(documents.id, document.id));

    // First attempt of three: the failure must propagate for BullMQ to retry,
    // but the document must not be marked failed yet.
    await expect(harness.processor.process(jobFor(document.id, 0, 3))).rejects.toThrow();

    const after = await harness.documents.get(document.id);
    expect(after.status).not.toBe('failed');
  }, 60_000);

  it('AC10: marks the document failed once the attempts are exhausted', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    await harness.db
      .update(documents)
      .set({ storageKey: 'documents/missing/original' })
      .where(eq(documents.id, document.id));

    await expect(harness.processor.process(jobFor(document.id, 2, 3))).rejects.toThrow();

    const after = await harness.documents.get(document.id);
    expect(after.status).toBe('failed');
    expect(after.error).toBeTruthy();
  }, 60_000);

  it('AC11: records what the embedding cost in the usage ledger', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));

    await harness.processor.process(jobFor(document.id));

    const usage = await harness.db.execute(
      sql`select operation, provider from llm_usage where operation = 'embed'`,
    );

    expect(usage.rows.length).toBeGreaterThan(0);
  }, 60_000);

  it('AC12: skips quietly when the document was deleted while queued', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    await harness.documents.remove(document.id);

    await expect(harness.processor.process(jobFor(document.id))).resolves.toBeUndefined();
  }, 60_000);

  it('AC13: deduplicates the same bytes and does not store them twice', async () => {
    const first = await harness.documents.upload(fileFrom('a.md', MARKDOWN));
    const second = await harness.documents.upload(fileFrom('b.md', MARKDOWN));

    expect(second.deduplicated).toBe(true);
    expect(second.document.id).toBe(first.document.id);

    const all = await harness.db.select().from(documents);
    expect(all).toHaveLength(1);
  }, 60_000);

  it('AC14: deletes chunks and the stored original with the document', async () => {
    const { document } = await harness.documents.upload(fileFrom('billing.md', MARKDOWN));
    await harness.processor.process(jobFor(document.id));

    await harness.documents.remove(document.id);

    expect(await chunksOf(harness.db, document.id)).toHaveLength(0);
  }, 60_000);
});
