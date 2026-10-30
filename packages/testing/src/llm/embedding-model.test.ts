import { embed, embedMany } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  MOCK_EMBEDDING_DIMENSIONS,
  createDeterministicEmbeddingModel,
  hashEmbedding,
} from './embedding-model.js';

const magnitude = (vector: number[]) =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

describe('hashEmbedding', () => {
  it('AC1: produces a vector of the requested length', () => {
    expect(hashEmbedding('hello', 8)).toHaveLength(8);
  });

  it('AC2: defaults to the dimension count the database column expects', () => {
    expect(hashEmbedding('hello')).toHaveLength(MOCK_EMBEDDING_DIMENSIONS);
  });

  it('AC3: is deterministic, so a failing test reproduces', () => {
    expect(hashEmbedding('how do I authenticate?')).toStrictEqual(
      hashEmbedding('how do I authenticate?'),
    );
  });

  it('AC4: gives different text different vectors', () => {
    expect(hashEmbedding('authentication')).not.toStrictEqual(hashEmbedding('rate limiting'));
  });

  it('AC5: returns unit length vectors, because the index compares by cosine', () => {
    expect(magnitude(hashEmbedding('anything'))).toBeCloseTo(1, 10);
  });

  it('AC6: does not tile a short digest across a long vector', () => {
    const vector = hashEmbedding('hello', 128);
    const firstBlock = vector.slice(0, 32);
    const secondBlock = vector.slice(32, 64);

    expect(firstBlock).not.toStrictEqual(secondBlock);
  });

  it('AC7: handles empty input', () => {
    expect(hashEmbedding('', 4)).toHaveLength(4);
  });

  it('AC8: handles accented text, which the Portuguese corpus is full of', () => {
    expect(hashEmbedding('autenticação')).not.toStrictEqual(hashEmbedding('autenticacao'));
  });
});

describe('createDeterministicEmbeddingModel', () => {
  it('AC9: works through the ai sdk embed call with no api key', async () => {
    const model = createDeterministicEmbeddingModel(16);

    const { embedding } = await embed({ model, value: 'how do I authenticate?' });

    expect(embedding).toStrictEqual(hashEmbedding('how do I authenticate?', 16));
  });

  it('AC10: embeds a batch in one call, which is what the embedder relies on', async () => {
    const model = createDeterministicEmbeddingModel(16);

    const { embeddings } = await embedMany({ model, values: ['one', 'two', 'three'] });

    expect(embeddings).toHaveLength(3);
    expect(model.doEmbedCalls).toHaveLength(1);
  });

  it('AC11: splits a batch larger than the provider limit, like a real provider', async () => {
    const model = createDeterministicEmbeddingModel(8);
    const values = Array.from({ length: 200 }, (_unused, index) => `chunk ${String(index)}`);

    const { embeddings } = await embedMany({ model, values });

    expect(embeddings).toHaveLength(200);
    expect(model.doEmbedCalls.length).toBeGreaterThan(1);
  });

  it('AC12: reports token usage, so cost logging has something to record', async () => {
    const model = createDeterministicEmbeddingModel(8);

    const { usage } = await embedMany({ model, values: ['abc', 'de'] });

    expect(usage.tokens).toBe(5);
  });
});
