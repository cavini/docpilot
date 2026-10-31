import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';

import { InvalidRequestError } from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { EmbedderService } from '../llm/index.js';
import { fuse } from './fusion.js';
import { QueryCacheService } from './query-cache.service.js';
import {
  CANDIDATE_POOL,
  keywordSearchQuery,
  toVectorLiteral,
  vectorSearchQuery,
} from './retrieval.sql.js';
import {
  type RetrievedChunk,
  type ScoredChunk,
  type SearchOptions,
  type SearchResult,
} from './retrieval.types.js';

/**
 * Shape of a row from the retrieval queries.
 *
 * Parsed rather than cast. A raw SQL result is `Record<string, unknown>`, and
 * asserting a type over it would mean a column renamed in the query surfaces
 * as `undefined` somewhere far away instead of as an error here. The same rule
 * the rest of the application follows for HTTP input applies to a hand-written
 * query: validate at the boundary.
 */
const chunkRowSchema = z.object({
  chunk_id: z.string(),
  document_id: z.string(),
  document_title: z.string(),
  content: z.string(),
  heading_path: z.string().nullable(),
  page_start: z.number().nullable(),
  page_end: z.number().nullable(),
});

/** Converts raw rows into the shape the rest of the application uses. */
function toRetrieved(rows: Record<string, unknown>[]): RetrievedChunk[] {
  return rows.map((row) => {
    const parsed = chunkRowSchema.parse(row);

    return {
      chunkId: parsed.chunk_id,
      documentId: parsed.document_id,
      documentTitle: parsed.document_title,
      content: parsed.content,
      headingPath: parsed.heading_path,
      pageStart: parsed.page_start,
      pageEnd: parsed.page_end,
    };
  });
}

/**
 * Finds the passages most likely to answer a question.
 *
 * Runs a vector search and a keyword search, then fuses the two ranked lists.
 * Neither alone is sufficient: embeddings find a paraphrase and blur an exact
 * identifier, keyword search does the opposite. See
 * [ADR 0006](../../../docs/adr/0006-hybrid-search-rrf.md).
 */
@Injectable()
export class RetrievalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly embedder: EmbedderService,
    private readonly cache: QueryCacheService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RetrievalService.name);
  }

  /**
   * Searches the corpus.
   *
   * The two searches run **concurrently**: they are independent queries
   * against the same database, so the search costs the slower of the two
   * rather than their sum.
   *
   * @param options The query, how many results, and an optional document
   *   filter.
   * @returns Ranked results with the per-method ranks that produced them.
   * @throws {InvalidRequestError} If the query is empty or too long.
   *
   * @example
   * ```ts
   * await retrieval.search({ query: 'how do I authenticate?', topK: 8 });
   * ```
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startedAt = Date.now();
    const query = options.query.trim();

    if (query.length === 0) {
      throw new InvalidRequestError('The search query is empty.');
    }

    if (query.length > this.env.MAX_QUESTION_LENGTH) {
      throw new InvalidRequestError(
        `The search query is longer than the ${String(this.env.MAX_QUESTION_LENGTH)} character limit.`,
      );
    }

    const topK = Math.min(options.topK ?? this.env.RETRIEVAL_TOP_K, CANDIDATE_POOL);
    const { embedding, cached } = await this.embedQuery(query);

    const [vectorRows, keywordRows] = await Promise.all([
      this.db.execute(
        vectorSearchQuery(toVectorLiteral(embedding), options.documentIds, CANDIDATE_POOL),
      ),
      this.db.execute(keywordSearchQuery(query, options.documentIds, CANDIDATE_POOL)),
    ]);

    const fused = fuse([
      { name: 'vector', results: toRetrieved(vectorRows.rows) },
      { name: 'keyword', results: toRetrieved(keywordRows.rows) },
    ]);

    const results: ScoredChunk[] = fused.slice(0, topK).map((entry) => ({
      ...entry.item,
      score: entry.score,
      vectorRank: entry.ranks.vector ?? null,
      keywordRank: entry.ranks.keyword ?? null,
    }));

    const tookMs = Date.now() - startedAt;

    this.logger.debug(
      {
        queryLength: query.length,
        vectorCandidates: vectorRows.rows.length,
        keywordCandidates: keywordRows.rows.length,
        returned: results.length,
        cached,
        tookMs,
      },
      'hybrid search',
    );

    return { results, tookMs, cached };
  }

  /** Embeds a query, using the cache when it can. */
  private async embedQuery(query: string): Promise<{ embedding: number[]; cached: boolean }> {
    const { model } = this.embedder.describe;
    const hit = await this.cache.readEmbedding(query, model);

    if (hit) {
      return { embedding: hit, cached: true };
    }

    const [embedding] = await this.embedder.embed([query]);

    if (!embedding) {
      throw new Error('The embedding provider returned no vector for the query.');
    }

    await this.cache.writeEmbedding(query, model, embedding);

    return { embedding, cached: false };
  }
}
