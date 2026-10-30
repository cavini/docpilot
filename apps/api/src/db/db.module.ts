import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from './database.type.js';
import { DATABASE, PG_POOL } from './db.tokens.js';
import * as schema from './schema/index.js';

/**
 * Owns the Postgres connection pool and the Drizzle query builder.
 *
 * Global, because almost every feature module reads or writes the database and
 * importing this module into each one adds noise without adding safety.
 *
 * The pool is closed on shutdown so that a stopping process does not hold
 * server-side connections open; without this, repeated restarts during
 * development exhaust `max_connections`.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Pool({
          connectionString: env.DATABASE_URL,
          // Ingestion runs several embedding batches at once, and each needs a
          // connection to write chunks. Kept well under the Postgres default
          // so a second process can still connect.
          max: 10,
          idleTimeoutMillis: 30_000,
          // Fail fast rather than queue forever behind an unreachable database:
          // the health check should report `down`, not hang.
          connectionTimeoutMillis: 5_000,
        }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DATABASE, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DbModule.name);
  }

  /** Releases every pooled connection as the process stops. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    this.logger.info('database pool closed');
  }
}
