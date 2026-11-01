import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Files searched for local configuration, **most specific first**.
 *
 * Order matters and not in the direction it looks. `process.loadEnvFile` does
 * not overwrite a variable that is already set, so the **first** file to
 * define a value is the one that wins. An earlier version of this list had
 * the root file first and a comment claiming the app-local one could override
 * it; the opposite was true, and the test alongside it only asserted which
 * files were found, so nothing caught it.
 *
 * `.env.local` exists for values a developer wants to keep that a tool might
 * rewrite. `neon env pull` overwrites `DATABASE_URL` in `.env` every time it
 * runs, and without somewhere of higher precedence to put it, local
 * development would silently start talking to the production database.
 */
export const ENV_FILES = ['.env.local', '.env', '../../.env.local', '../../.env'] as const;

/**
 * Loads `.env` into the environment, if one exists.
 *
 * Node applies the same precedence as `--env-file`: a variable already present
 * in the real environment wins over the file. That is the behaviour this
 * needs. In CI and in production the platform supplies the configuration, and
 * a stale file left in an image must not be able to override it.
 *
 * The same rule is what orders {@link ENV_FILES}: because nothing already set
 * is overwritten, the first file to define a value wins.
 *
 * A missing file is not an error. A container image ships without one, and
 * requiring it would make the application refuse to start in exactly the
 * environment it is meant for.
 *
 * Called at the top of every entrypoint, before `loadEnv` validates the
 * result.
 *
 * @param baseDir Directory the paths resolve against. Defaults to the working
 *   directory, which for every script in this workspace is the app's own
 *   directory.
 * @returns The files that were found and loaded, highest precedence first.
 *   Useful for diagnosing which configuration a process actually picked up.
 *
 * @example
 * ```ts
 * loadDotenv(); // ['/repo/apps/api/.env', '/repo/.env']
 * ```
 */
export function loadDotenv(baseDir: string = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const file of ENV_FILES) {
    const path = resolve(baseDir, file);

    if (existsSync(path)) {
      process.loadEnvFile(path);
      loaded.push(path);
    }
  }

  return loaded;
}
