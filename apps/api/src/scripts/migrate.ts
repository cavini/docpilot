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
  /*
   * Written to stderr and exited non-zero so the platform treats a failed
   * migration as a failed release rather than starting an application
   * against a schema it does not match.
   *
   * The cause chain is printed, not just the message. Postgres errors arrive
   * wrapped, and the wrapper says which query failed while the cause says
   * why - the half that tells you whether to fix a connection string or a
   * permission. A first run of this reported only `Failed query: CREATE
   * SCHEMA ...` and left the actual reason on the floor.
   */
  /** Renders a value the driver attached, which may be of any shape. */
  const asText = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  const parts: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    const code = asText((current as { code?: unknown }).code);
    const detail = asText((current as { detail?: unknown }).detail);

    parts.push(
      [current.message, code === '' ? '' : `(code ${code})`, detail].filter(Boolean).join(' '),
    );
    current = current.cause;
  }

  process.stderr.write(`migration failed: ${parts.join('\n  caused by: ')}\n`);
  process.exit(1);
});
