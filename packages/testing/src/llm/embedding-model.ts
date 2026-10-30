import { createHash } from 'node:crypto';

import { MockEmbeddingModelV4 } from 'ai/test';

/** Dimension count the deterministic model produces by default. */
export const MOCK_EMBEDDING_DIMENSIONS = 1536;

/**
 * Turns text into a stable pseudo-random unit vector.
 *
 * The vector is derived from a SHA-256 hash of the text, so the same input
 * always yields the same vector and different inputs yield different ones.
 * That is enough to test the plumbing: that embeddings are batched, stored in
 * the right column, and that a cache hit avoids a second call.
 *
 * It is deliberately **not** semantically meaningful. Two paraphrases hash to
 * unrelated vectors, so retrieval *quality* cannot be tested with this.
 * Quality tests use real embeddings recorded once from the provider and
 * committed as a fixture.
 *
 * The vector is normalised to unit length because cosine distance is what the
 * index uses, and unnormalised vectors would make distances depend on text
 * length.
 *
 * @param text Input to embed.
 * @param dimensions Length of the vector.
 * @returns A unit-length vector of `dimensions` numbers.
 */
export function hashEmbedding(
  text: string,
  dimensions: number = MOCK_EMBEDDING_DIMENSIONS,
): number[] {
  const vector = new Array<number>(dimensions);
  let digest = createHash('sha256').update(text).digest();

  for (let index = 0; index < dimensions; index += 1) {
    const offset = index % digest.length;

    if (offset === 0 && index > 0) {
      // Re-hash rather than repeat the digest, so a long vector does not
      // become a tiling of the same 32 values.
      digest = createHash('sha256').update(digest).digest();
    }

    // Map a byte onto [-1, 1].
    vector[index] = (digest[offset] ?? 0) / 127.5 - 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

/**
 * An embedding model that needs no API key and no network.
 *
 * Wired through the same provider factory the application uses in production,
 * so tests exercise the real embedder code path rather than a branch that only
 * exists in tests.
 *
 * @param dimensions Vector length, which must match the database column.
 * @returns A mock embedding model and the list of calls made to it.
 *
 * @example
 * ```ts
 * const model = createDeterministicEmbeddingModel();
 * const { embeddings } = await embedMany({ model, values: ['a', 'b'] });
 * ```
 */
export function createDeterministicEmbeddingModel(
  dimensions: number = MOCK_EMBEDDING_DIMENSIONS,
): MockEmbeddingModelV4 {
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId: 'mock-embedding',
    // Mirrors a real provider's batch limit, so the batching code is exercised
    // rather than bypassed.
    maxEmbeddingsPerCall: 96,
    supportsParallelCalls: true,
    // The spec requires a promise, even though nothing here is async.
    doEmbed: ({ values }) =>
      Promise.resolve({
        embeddings: values.map((value) => hashEmbedding(value, dimensions)),
        usage: { tokens: values.reduce((sum, value) => sum + value.length, 0) },
        warnings: [],
      }),
  });
}
