import { type SQL, sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { documents } from './documents.js';

/**
 * Dimension count of the stored embeddings.
 *
 * Fixed in the schema because a `vector` column has a declared width and an
 * index built for it. Changing the embedding model to one with a different
 * width is a migration and a re-embedding of the whole corpus, not a
 * configuration change; `EMBEDDING_DIMENSIONS` is validated against this at
 * startup so the mismatch is caught immediately rather than on first insert.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Postgres `tsvector`, which Drizzle has no built-in type for. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * Postgres `regconfig`: the identifier of a text-search configuration.
 *
 * Stored as `regconfig` rather than `text` because the `tsv` column below is
 * generated, and a generated column's expression must be immutable. Casting
 * text to `regconfig` is only stable, so `to_tsvector(language::regconfig, ...)`
 * is rejected by Postgres; taking the column as `regconfig` already makes the
 * two-argument `to_tsvector` immutable and the expression legal.
 */
const regconfig = customType<{ data: 'english' | 'portuguese'; driverData: string }>({
  dataType: () => 'regconfig',
});

/** A passage of a document, embedded and indexed for retrieval. */
export const chunks = pgTable(
  'chunks',
  {
    id: uuid().primaryKey().defaultRandom(),

    documentId: uuid()
      .notNull()
      // Deleting a document must take its chunks with it; an orphaned chunk
      // would still be retrievable and would cite a document that is gone.
      .references(() => documents.id, { onDelete: 'cascade' }),

    /** Position in the document, from 0. */
    ordinal: integer().notNull(),

    content: text().notNull(),

    /** Tokens in `content`, as counted by the tokenizer used to split it. */
    tokenCount: integer().notNull(),

    /**
     * The chain of headings above this passage, joined by `" > "`, such as
     * `"Auth > Tokens > Refresh"`. Shown with a citation so a reader knows
     * where in the document they have landed.
     */
    headingPath: text(),

    /** Page range covered, for PDFs. Null for formats without pages. */
    pageStart: integer(),
    pageEnd: integer(),

    /** Character offsets into the extracted text, for highlighting. */
    charStart: integer().notNull(),
    charEnd: integer().notNull(),

    /**
     * Text-search configuration for this chunk, copied from its document.
     *
     * Denormalised on purpose: a generated column can only read columns in its
     * own row, and the stemmer has to be chosen per document. Indexing
     * Portuguese with the English stemmer silently halves keyword recall,
     * which is the kind of bug that never announces itself.
     */
    language: regconfig().notNull().default('english'),

    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),

    /**
     * Lexemes for keyword search, maintained by Postgres.
     *
     * A generated column rather than something the application writes, so it
     * cannot drift from `content`: there is no code path that updates one
     * without the other.
     */
    tsv: tsvector().generatedAlwaysAs((): SQL => sql`to_tsvector(language, content)`),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Reading a document's chunks in order, and the uniqueness that makes a
    // re-ingestion bug visible instead of silently duplicating passages.
    uniqueIndex('chunks_document_ordinal_idx').on(table.documentId, table.ordinal),

    // Approximate nearest neighbour over cosine distance. HNSW rather than
    // IVFFlat because it needs no training step and holds its recall as the
    // corpus grows; the cost is a slower build and more memory.
    index('chunks_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),

    // Keyword search. GIN is the right index for a tsvector.
    index('chunks_tsv_idx').using('gin', table.tsv),
  ],
);

/** A chunk row as read from the database. */
export type ChunkRow = typeof chunks.$inferSelect;

/** The fields needed to insert a chunk. */
export type NewChunkRow = typeof chunks.$inferInsert;
