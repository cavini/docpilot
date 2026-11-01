import {
  budgetAllowing,
  budgetExhausted,
  type BudgetLike,
  createScriptedLanguageModel,
  type ScriptedResponse,
} from '@docpilot/testing';

import { type Env } from '../config/env.schema.js';
import { type UsageService } from '../llm/index.js';
import { type RetrievalService, type ScoredChunk } from '../retrieval/index.js';
import { ExtractionFailedError, ExtractionService } from './extraction.service.js';

const env = { MAX_OUTPUT_TOKENS: 1_024 } as Env;

const ENDPOINT = {
  method: 'POST',
  path: '/auth/token',
  summary: 'Exchange credentials for a bearer token.',
  authenticated: false,
};

const chunk = (n: number): ScoredChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: 'doc-1',
  documentTitle: 'lumen-api',
  content: `POST /auth/token exchanges credentials. Passage ${String(n)}.`,
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  score: 0.03,
  vectorRank: n,
  keywordRank: n,
});

/** Wraps items the way `Output.array` reads them back. */
function asArrayOutput(items: unknown): ScriptedResponse {
  return { text: JSON.stringify({ elements: items }) };
}

/** Builds the service with everything substituted. */
function createService(
  options: { results?: ScoredChunk[]; script?: ScriptedResponse[]; budget?: BudgetLike } = {},
) {
  const budget = options.budget ?? budgetAllowing();
  const search = jest.fn().mockResolvedValue({
    results: options.results ?? [chunk(1), chunk(2)],
    tookMs: 5,
    cached: false,
  });

  const model = createScriptedLanguageModel(options.script ?? [asArrayOutput([ENDPOINT])]);
  const chatModel = jest.fn(() => ({ model, provider: 'mock', modelId: 'mock-chat' }));
  const record = jest.fn().mockResolvedValue(undefined);
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  return {
    service: new ExtractionService(
      env,
      { search } as unknown as RetrievalService,
      { record } as unknown as UsageService,
      logger as never,
      chatModel,
      budget as never,
    ),
    search,
    record,
    model,
    chatModel,
  };
}

/** Drains the streaming generator. */
async function drain(generator: AsyncGenerator): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = [];

  for await (const event of generator) {
    events.push(event as Record<string, unknown>);
  }

  return events;
}

describe('ExtractionService.extract', () => {
  it('AC1: returns items that validate against the named schema', async () => {
    const { service } = createService();

    const result = await service.extract({ schema: 'api_endpoints' });

    expect(result.items).toEqual([ENDPOINT]);
    expect(result.schema).toBe('api_endpoints');
  });

  it('AC2: rejects a schema the registry does not know, and names the ones it does', async () => {
    const { service } = createService();

    await expect(service.extract({ schema: 'everything_please' })).rejects.toThrow(/api_endpoints/);
  });

  it('AC3, AC4: repairs a first attempt that failed validation', async () => {
    // Models correct a malformed field when told which field and why; they do
    // not correct it when asked again identically.
    const { service, model } = createService({
      script: [asArrayOutput([{ nothing: 'like an endpoint' }]), asArrayOutput([ENDPOINT])],
    });

    const result = await service.extract({ schema: 'api_endpoints' });

    expect(result.repaired).toBe(true);
    expect(result.items).toEqual([ENDPOINT]);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('AC3: tells the model what was wrong, rather than asking again identically', async () => {
    const { service, model } = createService({
      script: [asArrayOutput([{ nothing: 'like an endpoint' }]), asArrayOutput([ENDPOINT])],
    });

    await service.extract({ schema: 'api_endpoints' });
    const second = JSON.stringify(model.doGenerateCalls[1]);

    expect(second).toContain('did not match');
  });

  it('AC5: gives up after one repair rather than trying a third time', async () => {
    const { service, model } = createService({
      script: [asArrayOutput([{ nope: true }]), asArrayOutput([{ still: 'wrong' }])],
    });

    await expect(service.extract({ schema: 'api_endpoints' })).rejects.toThrow(
      ExtractionFailedError,
    );
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('reports repaired as false when the first attempt was fine', async () => {
    const { service } = createService();

    expect((await service.extract({ schema: 'api_endpoints' })).repaired).toBe(false);
  });

  it('AC6: returns an empty list when nothing was retrieved, not invented items', async () => {
    const { service, model } = createService({ results: [] });

    const result = await service.extract({ schema: 'api_endpoints' });

    expect(result.items).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('AC7: restricts retrieval to one document when asked', async () => {
    const { service, search } = createService();
    const documentId = '3f1b9c2e-0000-4000-8000-000000000000';

    await service.extract({ schema: 'api_endpoints', documentId });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentIds: [documentId] }));
  });

  it("uses the schema's own default query when none is given", async () => {
    const { service, search } = createService();

    await service.extract({ schema: 'api_endpoints' });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('endpoints') }),
    );
  });

  it('AC8: returns citations back to the passages it read', async () => {
    const { service } = createService();

    const result = await service.extract({ schema: 'api_endpoints' });

    expect(result.citations).toEqual([
      expect.objectContaining({ n: 1, chunkId: 'chunk-1', documentTitle: 'lumen-api' }),
      expect.objectContaining({ n: 2, chunkId: 'chunk-2' }),
    ]);
  });

  it('AC9: records what the extraction cost', async () => {
    const { service, record } = createService();

    await service.extract({ schema: 'api_endpoints' });

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'structured' }));
  });

  it('records both attempts as one call when it repaired', async () => {
    // Two model calls, one extraction. Billing the caller twice for one
    // request would make the ledger disagree with the invoice.
    const { service, record } = createService({
      script: [asArrayOutput([{ nope: true }]), asArrayOutput([ENDPOINT])],
    });

    await service.extract({ schema: 'api_endpoints' });

    expect(record).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the same item found in two passages', async () => {
    const { service } = createService({
      script: [asArrayOutput([ENDPOINT, { ...ENDPOINT, summary: 'worded differently' }])],
    });

    expect((await service.extract({ schema: 'api_endpoints' })).items).toHaveLength(1);
  });

  it('extracts the other schemas too', async () => {
    const outline = { level: 2, heading: 'Authentication', gist: 'How to get a token.' };
    const { service } = createService({ script: [asArrayOutput([outline])] });

    expect((await service.extract({ schema: 'document_outline' })).items).toEqual([outline]);
  });
});

describe('ExtractionService.stream', () => {
  it('AC11: yields the schema first, then one event per item', async () => {
    const second = { ...ENDPOINT, method: 'GET', path: '/usage' };
    const { service } = createService({ script: [asArrayOutput([ENDPOINT, second])] });

    const events = await drain(service.stream({ schema: 'api_endpoints' }));

    expect(events[0]).toMatchObject({ type: 'schema', schema: 'api_endpoints' });
    expect(events.filter((event) => event.type === 'item')).toEqual([
      { type: 'item', item: ENDPOINT },
      { type: 'item', item: second },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('AC12: yields only completed items', async () => {
    // `elementStream` gives finished elements rather than a growing partial
    // object: a half-arrived row is indistinguishable from a row with
    // missing data.
    const { service } = createService({ script: [asArrayOutput([ENDPOINT])] });

    const items = (await drain(service.stream({ schema: 'api_endpoints' }))).filter(
      (event) => event.type === 'item',
    );

    for (const event of items) {
      expect(event.item).toEqual(ENDPOINT);
    }
  });

  it('carries the citations on the first event, before any item', async () => {
    const { service } = createService();

    const events = await drain(service.stream({ schema: 'api_endpoints' }));

    expect(events[0]).toMatchObject({
      citations: [expect.objectContaining({ n: 1 }), expect.objectContaining({ n: 2 })],
    });
  });

  it('AC2: rejects an unknown schema before yielding anything', async () => {
    const { service } = createService();

    await expect(drain(service.stream({ schema: 'nope' }))).rejects.toThrow(/api_endpoints/);
  });

  it('AC6: finishes immediately when nothing was retrieved', async () => {
    const { service, model } = createService({ results: [] });

    const events = await drain(service.stream({ schema: 'api_endpoints' }));

    expect(events.map((event) => event.type)).toEqual(['schema', 'done']);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('drops an item that does not validate, and counts it', async () => {
    const { service } = createService({
      script: [asArrayOutput([ENDPOINT, { method: 'TRACE', path: '/x' }])],
    });

    const events = await drain(service.stream({ schema: 'api_endpoints' }));

    expect(events.filter((event) => event.type === 'item')).toHaveLength(1);
  });

  it('AC9: records what the stream cost', async () => {
    const { service, record } = createService();

    await drain(service.stream({ schema: 'api_endpoints' }));

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'structured' }));
  });

  describe("when the day's spend ceiling has been reached", () => {
    it('AC11: extracts from the mock and says so on the result', async () => {
      const { service, chatModel } = createService({ budget: budgetExhausted() });

      const result = await service.extract({ schema: 'api_endpoints' });

      expect(result.degraded).toBe(true);
      expect(chatModel).toHaveBeenCalledWith(expect.anything(), { forceMock: true });
    });

    it('AC11: labels the stream on its first event, before any row', async () => {
      const { service } = createService({ budget: budgetExhausted() });
      const events = [];

      for await (const event of service.stream({ schema: 'api_endpoints' })) {
        events.push(event);
      }

      // The table is labelled from the moment it has anything in it, rather
      // than after the reader has started reading rows.
      expect(events[0]).toMatchObject({
        type: 'schema',
        degraded: true,
        resetsAt: '2026-11-02T00:00:00.000Z',
      });
    });

    it('AC10: reports no degradation when a real provider answered', async () => {
      const { service } = createService();

      expect((await service.extract({ schema: 'api_endpoints' })).degraded).toBe(false);
    });
  });
});
