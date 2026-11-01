import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { loadEnv } from '../config/load-env.js';

/**
 * Applies pending migrations, then exits.
 *
 * Separate from `drizzle-kit migrate` because drizzle-kit is a development
 * dependency and is pruned out of the deployed image. The migrator in
 * `drizzle-orm` is not, and reads the same `drizzle/` folder the CLI writes -
 * so what runs in production is the same set of files reviewed locally.
 *
 * Run as the container's release step rather than from the application's
 * startup path: a process that migrates as a side effect of booting will, with
 * two instances, migrate twice.
 */
async function main(): Promise<void> {
  const env = loadEnv();

  // The direct endpoint where one is published. A pooler can hand successive
  // statements to different backends, and a migration is a sequence of
  // statements that assumes it shares a session.
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    // Relative to the working directory, which the image sets to where the
    // migrations were copied.
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    process.stdout.write('migrations applied\n');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Written to stderr and exited non-zero so the platform treats a failed
  // migration as a failed release rather than starting an application against
  // a schema it does not match.
  process.stderr.write(`migration failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exit(1);
});
