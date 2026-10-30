import { type NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from './schema/index.js';

/**
 * The Drizzle query builder, typed against the full schema.
 *
 * Aliased here so that provider constructors depend on one name rather than on
 * Drizzle's generic, and so the schema type is wired in exactly once.
 */
export type Database = NodePgDatabase<typeof schema>;
