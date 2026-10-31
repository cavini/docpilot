import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Who produced a message. */
export const messageRole = pgEnum('message_role', ['user', 'assistant']);

/**
 * How an assistant message ended.
 *
 * Stored rather than inferred, because the three cases need different
 * treatment on resume and are indistinguishable from the text alone: a
 * complete answer, one the reader stopped part-way, and one the provider
 * failed during.
 */
export const messageOutcome = pgEnum('message_outcome', ['complete', 'stopped', 'failed']);

/** A chat conversation. */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid().primaryKey().defaultRandom(),

    /**
     * Display name, taken from the first question.
     *
     * Derived once and stored rather than recomputed from the first message,
     * so renaming a conversation later is a column update rather than a
     * schema change.
     */
    title: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The conversation list is "most recently used first", so the index
    // matches the sort. On `updatedAt`, not `createdAt`: an old conversation
    // someone just returned to belongs at the top.
    index('conversations_updated_at_idx').on(sql`${table.updatedAt} DESC`),
  ],
);

/**
 * One turn in a conversation.
 *
 * Citations live here as `jsonb` rather than in a join table. They are a
 * **snapshot** of what the answer actually rested on, written once and never
 * queried across messages — and the snapshot has to survive the document being
 * deleted, which a foreign key to `chunks` would prevent. A reader opening an
 * old conversation should see what they were shown at the time, not an empty
 * list because the corpus moved on.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),

    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    role: messageRole().notNull(),

    content: text().notNull(),

    /**
     * Position within the conversation.
     *
     * Explicit rather than ordering by `createdAt`, because two messages
     * written in the same millisecond would have no defined order and a
     * transcript with its turns swapped is nonsense.
     */
    ordinal: integer().notNull(),

    /** Null for a user message; set for every assistant message. */
    outcome: messageOutcome(),

    /**
     * Citations the answer carried, as returned to the client.
     *
     * Typed as the shape `/ask` and `/chat` publish, so a resumed conversation
     * renders from storage exactly as it did when it streamed.
     */
    citations: jsonb().$type<StoredCitation[]>().notNull().default([]),

    /** Tokens and cost for the call that produced this message. */
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Reads a conversation's turns in order, which is the only way messages
    // are ever queried.
    index('messages_conversation_ordinal_idx').on(table.conversationId, table.ordinal),
  ],
);

/** A citation as stored with the message that cited it. */
export interface StoredCitation {
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  snippet: string;
}

/** A conversation row as read from the database. */
export type ConversationRow = typeof conversations.$inferSelect;

/** The fields needed to insert a conversation. */
export type NewConversationRow = typeof conversations.$inferInsert;

/** A message row as read from the database. */
export type MessageRow = typeof messages.$inferSelect;

/** The fields needed to insert a message. */
export type NewMessageRow = typeof messages.$inferInsert;
