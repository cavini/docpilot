import { type Env } from '../config/env.schema.js';
import { EmbedderService } from './embedder.service.js';
import { type UsageService } from './usage.service.js';

const env = (overrides: Partial<Env> = {}): Env =>
  ({
    EMBEDDING_PROVIDER: 'mock',
    EMBEDDING_MODEL: 'text-embedding-3-small',
    EMBEDDING_DIMENSIONS: 1536,
    ...overrides,
  }) as Env;

function createService(overrides: Partial<Env> = {}) {
  const usage = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UsageService;
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };

  return {
    service: new EmbedderService(env(overrides), usage, logger as never),
    usage,
    logger,
  };
}

describe('EmbedderService', () => {
  it('AC1: embeds every value, in order, with no key', async () => {
    const { service } = createService();

    const vectors = await service.embed(['authentication', 'rate limiting']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).not.toStrictEqual(vectors[1]);
  });

  it('AC2: produces vectors of the configured width', async () => {
    const { service } = createService({ EMBEDDING_DIMENSIONS: 8 });

    const [vector] = await service.embed(['anything']);

    expect(vector).toHaveLength(8);
  });

  it('AC3: returns an empty list for no input, without calling the provider', async () => {
    const { service, usage } = createService();

    await expect(service.embed([])).resolves.toStrictEqual([]);
    expect(usage.record).not.toHaveBeenCalled();
  });

  it('AC4: records usage for the batch', async () => {
    const { service, usage } = createService();

    await service.embed(['one', 'two']);

    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'embed', provider: 'mock', model: 'mock-embedding' }),
    );
  });

  it('AC5: records the token count the provider reported', async () => {
    const { service, usage } = createService();

    await service.embed(['abc', 'de']);

    const call = (usage.record as jest.Mock).mock.calls[0]?.[0] as { inputTokens: number };
    expect(call.inputTokens).toBeGreaterThan(0);
  });

  it('AC6: records how long the call took', async () => {
    const { service, usage } = createService();

    await service.embed(['one']);

    const call = (usage.record as jest.Mock).mock.calls[0]?.[0] as { latencyMs: number };
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('AC7: ties usage to the request that caused it, when given one', async () => {
    const { service, usage } = createService();

    await service.embed(['one'], 'req-42');

    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-42' }));
  });

  it('AC8: batches a large input rather than one call per value', async () => {
    const { service, usage } = createService({ EMBEDDING_DIMENSIONS: 8 });
    const values = Array.from({ length: 300 }, (_unused, i) => `chunk ${String(i)}`);

    const vectors = await service.embed(values);

    expect(vectors).toHaveLength(300);
    // Far fewer calls than values: the provider's batch limit, not one each.
    expect((usage.record as jest.Mock).mock.calls.length).toBeLessThan(10);
  });

  it('AC9: reports which provider and model it uses', () => {
    const { service } = createService();

    expect(service.describe).toStrictEqual({ provider: 'mock', model: 'mock-embedding' });
  });

  it('AC10: is deterministic, so a retrieval test can rely on it', async () => {
    const { service } = createService({ EMBEDDING_DIMENSIONS: 16 });

    const [first] = await service.embed(['how do I authenticate?']);
    const [second] = await service.embed(['how do I authenticate?']);

    expect(first).toStrictEqual(second);
  });
});
