import { type SQL, sql } from 'drizzle-orm';

import { SUPPORTED_LANGUAGES } from '../ingestion/parsers/language.js';

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

/**
 * How many extra nearest neighbours the vector search fetches before the
 * `ready` filter is applied.
 *
 * The approximate search has to run on `chunks` alone for the HNSW index to be
 * usable at all (see {@link vectorSearchQuery}), which means the document's
 * status can only be checked afterwards. Over-fetching keeps the pool full
 * when some of the nearest chunks belong to a document that is mid-ingestion
 * or has failed.
 *
 * Two is generous: a chunk whose document is not `ready` exists only between a
 * failed re-ingestion and its retry, so in practice nothing is filtered out.
 * It would under-deliver only if more than half of the nearest chunks belonged
 * to such documents, which would mean the corpus itself was broken.
 */
const READY_OVERFETCH = 2;

/** Builds the optional `document_id in (...)` filter shared by both searches. */
function documentFilter(documentIds: string[] | undefined): SQL {
  if (!documentIds || documentIds.length === 0) {
    return sql`true`;
  }

  return sql`c.document_id in ${documentIds}`;
}

/**
 * Matches a chunk against the query using its own text-search configuration.
 *
 * Written as one guarded branch per configuration rather than the obvious
 * `c.tsv @@ websearch_to_tsquery(c.language, $1)`, which is **equivalent and
 * cannot use the GIN index**: the right-hand side varies per row, so there is
 * no single key to probe the index with and Postgres falls back to evaluating
 * the match on every chunk in the table. Expanding the configurations into
 * constants makes each branch a key the index can answer, and the planner
 * combines them with a bitmap OR.
 *
 * The semantics are unchanged — an English chunk is still matched with the
 * English stemmer and a Portuguese one with the Portuguese stemmer. Dropping
 * the language guard would be shorter and would quietly loosen recall by
 * matching every chunk against both stemmings.
 *
 * Exported so an integration test can plan it against `chunks` alone. Planning
 * the whole {@link keywordSearchQuery} cannot establish this: on a small
 * corpus the planner legitimately prefers to drive from `documents` and probe
 * the join index, so the assertion would pass or fail with the corpus size
 * rather than with the thing being tested.
 *
 * @param query The raw user query.
 * @returns A predicate the GIN index can serve.
 */
export function keywordMatch(query: string): SQL {
  const branches = SUPPORTED_LANGUAGES.map(
    (language) =>
      sql`(c.language = ${language}::regconfig and c.tsv @@ websearch_to_tsquery(${language}, ${query}))`,
  );

  return sql.join(branches, sql` or `);
}

/**
 * Nearest neighbours by cosine distance.
 *
 * `<=>` is pgvector's cosine distance operator, and it is the operator the
 * HNSW index was built for — using a different one silently skips the index
 * and scans every row.
 *
 * The approximate search is in a subquery that touches **only `chunks`**, and
 * the join to `documents` happens outside it. That is not stylistic. An HNSW
 * index can serve an `order by … limit` only when `chunks` is the relation the
 * limit applies to; with the join inside, Postgres materialises the join and
 * sorts the result, abandoning the index while returning identical rows. The
 * query stays correct and stops being sublinear, which no test notices on a
 * small corpus.
 *
 * Because the status is therefore checked after the search, the subquery
 * over-fetches by {@link READY_OVERFETCH}.
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
    with nearest as (
      select
        c.id            as chunk_id,
        c.document_id   as document_id,
        c.content       as content,
        c.heading_path  as heading_path,
        c.page_start    as page_start,
        c.page_end      as page_end,
        c.embedding <=> ${embedding}::vector as distance
      from chunks c
      where c.embedding is not null
        and ${documentFilter(documentIds)}
      order by c.embedding <=> ${embedding}::vector
      limit ${limit * READY_OVERFETCH}
    )
    select
      n.chunk_id      as chunk_id,
      n.document_id   as document_id,
      d.title         as document_title,
      n.content       as content,
      n.heading_path  as heading_path,
      n.page_start    as page_start,
      n.page_end      as page_end
    from nearest n
    join documents d on d.id = n.document_id
    where d.status = 'ready'
    order by n.distance
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
 * query from one that mentions each word once in different paragraphs. It is
 * computed only for the rows that already matched, so it does not need to be
 * index-friendly — only {@link keywordMatch} does.
 *
 * The join to `documents` is safe here, unlike in the vector search: a GIN
 * match is a selection the planner can push into a bitmap scan on `chunks` and
 * join afterwards, whereas HNSW serves an ordering that a join above it
 * prevents from being pushed down.
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
      and (${keywordMatch(query)})
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
