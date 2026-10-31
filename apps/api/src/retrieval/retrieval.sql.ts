import { type SQL, sql } from 'drizzle-orm';

/**
 * How many results each method contributes before fusion.
 *
 * Deliberately larger than the number finally returned. Fusion can only
 * promote something it was given, so a passage that keyword search ranks 15th
 * and vector search ranks 2nd has to survive both candidate lists to be fused
 * at all. Too small a pool silently turns hybrid search back into whichever
 * method happened to rank a result first.
 */
export const CANDIDATE_POOL = 50;

/** Builds the optional `document_id in (...)` filter shared by both searches. */
function documentFilter(documentIds: string[] | undefined): SQL {
  if (!documentIds || documentIds.length === 0) {
    return sql`true`;
  }

  return sql`c.document_id in ${documentIds}`;
}

/**
 * Nearest neighbours by cosine distance.
 *
 * `<=>` is pgvector's cosine distance operator, and it is the operator the
 * HNSW index was built for — using a different one silently skips the index
 * and scans every row.
 *
 * Ordering is by distance ascending, because *smaller* distance means more
 * similar. Only the position matters downstream: fusion uses ranks, so the
 * distances never have to be made comparable with the keyword scores.
 *
 * @param embedding The query's embedding, as a pgvector literal.
 * @param documentIds Optional restriction.
 * @param limit Size of the candidate pool.
 */
export function vectorSearchQuery(
  embedding: string,
  documentIds: string[] | undefined,
  limit: number,
): SQL {
  return sql`
    select
      c.id            as chunk_id,
      c.document_id   as document_id,
      d.title         as document_title,
      c.content       as content,
      c.heading_path  as heading_path,
      c.page_start    as page_start,
      c.page_end      as page_end
    from chunks c
    join documents d on d.id = c.document_id
    where c.embedding is not null
      and d.status = 'ready'
      and ${documentFilter(documentIds)}
    order by c.embedding <=> ${embedding}::vector
    limit ${limit}
  `;
}

/**
 * Keyword matches, ranked by `ts_rank_cd`.
 *
 * `websearch_to_tsquery` parses the kind of query a person types — quoted
 * phrases, `or`, a leading `-` to exclude — and, unlike `to_tsquery`, never
 * throws on punctuation a user happens to include.
 *
 * `ts_rank_cd` is cover density ranking: it rewards matched terms appearing
 * close together, which is what distinguishes a passage genuinely about the
 * query from one that mentions each word once in different paragraphs.
 *
 * The query is parsed with **each chunk's own** text-search configuration, so
 * a Portuguese chunk is matched with the Portuguese stemmer. Using one
 * configuration for the whole corpus would silently halve recall on the other
 * language.
 *
 * @param query The raw user query.
 * @param documentIds Optional restriction.
 * @param limit Size of the candidate pool.
 */
export function keywordSearchQuery(
  query: string,
  documentIds: string[] | undefined,
  limit: number,
): SQL {
  return sql`
    select
      c.id            as chunk_id,
      c.document_id   as document_id,
      d.title         as document_title,
      c.content       as content,
      c.heading_path  as heading_path,
      c.page_start    as page_start,
      c.page_end      as page_end
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and c.tsv @@ websearch_to_tsquery(c.language, ${query})
      and ${documentFilter(documentIds)}
    order by ts_rank_cd(c.tsv, websearch_to_tsquery(c.language, ${query})) desc, c.id
    limit ${limit}
  `;
}

/**
 * Formats a vector for Postgres.
 *
 * pgvector accepts a bracketed, comma-separated list. Passing the array
 * directly would be serialised as a Postgres array, which is a different type.
 *
 * @param embedding The vector.
 * @returns A literal pgvector can cast.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
