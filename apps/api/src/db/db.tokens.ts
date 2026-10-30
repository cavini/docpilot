/**
 * Injection token for the Drizzle query builder.
 *
 * @example
 * ```ts
 * constructor(@Inject(DATABASE) private readonly db: Database) {}
 * ```
 */
export const DATABASE = Symbol('DOCPILOT_DATABASE');

/**
 * Injection token for the underlying connection pool.
 *
 * Needed by the health check, which pings the database directly, and by any
 * code that has to run SQL the query builder cannot express.
 */
export const PG_POOL = Symbol('DOCPILOT_PG_POOL');
