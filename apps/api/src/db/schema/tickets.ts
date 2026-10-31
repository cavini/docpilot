import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * A ticket the agent created, after the reader approved it.
 *
 * Stored even though the tracker is a mock, for two reasons. "Did it work" has
 * an answer that is not the model's account of what happened; and the test
 * that matters — denying an approval creates nothing — is a row count rather
 * than a reading of the reply.
 */
export const tickets = pgTable(
  'tickets',
  {
    id: uuid().primaryKey().defaultRandom(),

    title: text().notNull(),
    body: text().notNull(),

    /** Free-form labels the model proposed. */
    labels: jsonb().$type<string[]>().notNull().default([]),

    /**
     * The conversation the agent was in when it created this.
     *
     * Not a foreign key: a ticket outlives the conversation that produced it,
     * the same way the usage ledger outlives the document that caused a call.
     * Deleting a conversation must not rewrite what was done.
     */
    conversationId: uuid(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tickets_created_at_idx').on(sql`${table.createdAt} DESC`)],
);

/** A ticket row as read from the database. */
export type TicketRow = typeof tickets.$inferSelect;

/** The fields needed to insert a ticket. */
export type NewTicketRow = typeof tickets.$inferInsert;
