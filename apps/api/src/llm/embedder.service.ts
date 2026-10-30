import { Inject, Injectable } from '@nestjs/common';
import { embedMany } from 'ai';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { createEmbeddingModel, type ResolvedEmbeddingModel } from './provider.factory.js';
import { UsageService } from './usage.service.js';

/** How many times a failed batch is retried before giving up. */
const MAX_ATTEMPTS = 3;

/** Delay before the first retry; doubles each time. */
const BASE_RETRY_DELAY_MS = 500;

/** Waits, so a retry does not hammer a provider that is rate limiting. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Turns text into vectors.
 *
 * Batching is the point: one request per chunk would make ingesting a
 * hundred-page document a hundred round trips, and providers price and rate
 * limit per request as well as per token. `embedMany` splits the input to the
 * model's own batch limit, so the caller passes everything and the SDK does
 * the splitting.
 */
@Injectable()
export class EmbedderService {
  private readonly resolved: ResolvedEmbeddingModel;

  constructor(
    @Inject(ENV) env: Env,
    private readonly usage: UsageService,
    private readonly logger: PinoLogger,
  ) {
    this.resolved = createEmbeddingModel(env);
    this.logger.setContext(EmbedderService.name);
  }

  /** Which provider and model this instance embeds with. */
  get describe(): { provider: string; model: string } {
    return { provider: this.resolved.provider, model: this.resolved.modelId };
  }

  /**
   * Embeds many texts, retrying a failed batch with exponential backoff.
   *
   * Retried because the failures that matter here are transient: a rate limit,
   * a timeout, a provider blip. A malformed request would fail identically
   * every time and simply exhausts the attempts, which is the right outcome —
   * the job then fails with the provider's own message rather than looping.
   *
   * @param values Texts to embed, in order.
   * @param requestId Request that caused this, for the usage ledger.
   * @returns Vectors in the same order as `values`.
   * @throws The provider's error, after the attempts are exhausted.
   *
   * @example
   * ```ts
   * const vectors = await embedder.embed(chunks.map((c) => c.content));
   * ```
   */
  async embed(values: string[], requestId?: string): Promise<number[][]> {
    if (values.length === 0) {
      return [];
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();

      try {
        const result = await embedMany({ model: this.resolved.model, values });

        await this.usage.record({
          operation: 'embed',
          provider: this.resolved.provider,
          model: this.resolved.modelId,
          inputTokens: result.usage.tokens,
          latencyMs: Date.now() - startedAt,
          ...(requestId === undefined ? {} : { requestId }),
        });

        return result.embeddings;
      } catch (error) {
        lastError = error;

        this.logger.warn(
          { err: error, attempt, maxAttempts: MAX_ATTEMPTS, count: values.length },
          'embedding batch failed',
        );

        if (attempt < MAX_ATTEMPTS) {
          await delay(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
        }
      }
    }

    throw lastError;
  }
}
