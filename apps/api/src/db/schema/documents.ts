import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Where a document is in the ingestion pipeline.
 *
 * A Postgres enum rather than a free text column, so an impossible status
 * cannot be written, and so the states are visible in the schema rather than
 * only in application code.
 */
export const documentStatus = pgEnum('document_status', [
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'ready',
  'failed',
]);

/**
 * Language a document was detected to be in.
 *
 * Determines which Postgres text-search configuration its chunks are indexed
 * with: the English and Portuguese stemmers reduce words differently, and
 * using the wrong one quietly degrades keyword search.
 */
export const documentLanguage = pgEnum('document_language', ['english', 'portuguese']);

/** An uploaded source document. */
export const documents = pgTable(
  'documents',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Display name, derived from the filename without its extension. */
    title: text().notNull(),

    /** The name the file was uploaded under. Kept as a label only. */
    sourceFilename: text().notNull(),

    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),

    /**
     * SHA-256 of the file's bytes.
     *
     * Deduplication key: the same content uploaded twice is one document,
     * whatever it was named. Unique, so two concurrent uploads of the same
     * file cannot both create a row.
     */
    sha256: text().notNull(),

    /** Key the original bytes live under in object storage. */
    storageKey: text().notNull(),

    language: documentLanguage(),

    status: documentStatus().notNull().default('queued'),

    /** 0 to 100. The user-facing projection of queue progress. */
    progress: integer().notNull().default(0),

    /** Why ingestion failed. Readable, and never contains credentials. */
    error: text(),

    pageCount: integer(),

    /**
     * Number of chunks stored.
     *
     * Denormalised deliberately: the document list shows it for every row, and
     * counting chunks per document on every list request is the kind of query
     * that looks free until the corpus grows.
     */
    chunkCount: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('documents_sha256_idx').on(table.sha256),
    // The document list is "newest first", so the index matches the sort.
    index('documents_created_at_idx').on(sql`${table.createdAt} DESC`),
    index('documents_status_idx').on(table.status),
  ],
);

/** A document row as read from the database. */
export type DocumentRow = typeof documents.$inferSelect;

/** The fields needed to insert a document. */
export type NewDocumentRow = typeof documents.$inferInsert;
