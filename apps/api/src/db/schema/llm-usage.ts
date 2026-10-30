import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Which part of the product spent the tokens. */
export const llmOperation = pgEnum('llm_operation', [
  'embed',
  'chat',
  'agent',
  'structured',
  'eval',
]);

/**
 * One row per call to a model provider.
 *
 * Written for every call, including the ones that fail, so that "what did this
 * cost" and "why did this get slow" are questions the database can answer
 * rather than questions for a provider dashboard that only aggregates.
 */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Ties the call to the request that caused it, and to its log lines. */
    requestId: text(),

    operation: llmOperation().notNull(),
    provider: text().notNull(),
    model: text().notNull(),

    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),

    /**
     * Computed from a dated pricing table in code.
     *
     * `numeric` rather than a float: these are summed, and summing floats
     * drifts. Twelve digits with six decimals covers a fraction of a cent per
     * call and a very large total.
     */
    costUsd: numeric({ precision: 12, scale: 6 }).notNull().default('0'),

    latencyMs: integer(),

    /** Whether the result came from cache, so cost analysis can net it out. */
    cached: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('llm_usage_created_at_idx').on(table.createdAt),
    index('llm_usage_operation_idx').on(table.operation),
  ],
);

/** A usage row as read from the database. */
export type LlmUsageRow = typeof llmUsage.$inferSelect;

/** The fields needed to insert a usage row. */
export type NewLlmUsageRow = typeof llmUsage.$inferInsert;
