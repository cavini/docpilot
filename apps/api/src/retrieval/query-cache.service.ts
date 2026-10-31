import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';

/** Prefix for cached query embeddings. */
const EMBEDDING_PREFIX = 'retrieval:embedding';

/** Key holding the corpus version, bumped whenever a document changes. */
const CORPUS_VERSION_KEY = 'retrieval:corpus-version';

/**
 * Caches query embeddings.
 *
 * The same question asked twice costs one embedding call, not two. That
 * matters more than it sounds: a demo gets the same handful of questions
 * repeatedly, and an embedding call is both a bill and a round trip on the
 * path a user is waiting on.
 *
 * Only the **embedding** is cached, not the search results. An embedding of a
 * fixed string never goes stale, so it needs no invalidation at all; results
 * do, and getting that wrong means answering from documents that have been
 * deleted. Caching the cheap-to-invalidate half and not the dangerous half is
 * the deliberate trade.
 */
@Injectable()
export class QueryCacheService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueryCacheService.name);
  }

  /**
   * Reads a cached embedding for a query.
   *
   * @param query The raw query text.
   * @param model The embedding model, so changing it cannot read vectors
   *   produced by the previous one.
   * @returns The vector, or null if it is not cached or Redis is unavailable.
   */
  async readEmbedding(query: string, model: string): Promise<number[] | null> {
    try {
      const cached = await this.redis.get(this.embeddingKey(query, model));

      return cached === null ? null : (JSON.parse(cached) as number[]);
    } catch (error) {
      // A cache that is down must not take search with it.
      this.logger.warn({ err: error }, 'could not read the query embedding cache');
      return null;
    }
  }

  /**
   * Stores an embedding for a query.
   *
   * @param query The raw query text.
   * @param model The embedding model.
   * @param embedding The vector.
   */
  async writeEmbedding(query: string, model: string, embedding: number[]): Promise<void> {
    try {
      await this.redis.set(
        this.embeddingKey(query, model),
        JSON.stringify(embedding),
        'EX',
        this.env.CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'could not write the query embedding cache');
    }
  }

  /**
   * Marks the corpus as changed.
   *
   * Called when a document is ingested or deleted. Nothing currently keyed on
   * the corpus version is cached, but the counter is maintained from the start
   * so that adding a result cache later is a change in one place rather than a
   * hunt for every write that should have invalidated it.
   */
  async bumpCorpusVersion(): Promise<void> {
    try {
      await this.redis.incr(CORPUS_VERSION_KEY);
    } catch (error) {
      this.logger.warn({ err: error }, 'could not bump the corpus version');
    }
  }

  /**
   * Builds the cache key for a query.
   *
   * The query is hashed rather than used directly: a question can be long,
   * can contain any character including the colons Redis keys conventionally
   * use as separators, and is user input that should not be concatenated into
   * a key unescaped.
   */
  private embeddingKey(query: string, model: string): string {
    const digest = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');

    return `${EMBEDDING_PREFIX}:${model}:${digest}`;
  }
}
