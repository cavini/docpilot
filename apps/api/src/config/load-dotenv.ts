import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Files searched for local configuration, in order of increasing precedence.
 *
 * The repository keeps one `.env` at its root so the API and the web app are
 * configured in one place; an app-local file is read afterwards so a developer
 * can override a single value without editing the shared one.
 */
export const ENV_FILES = ['../../.env', '.env'] as const;

/**
 * Loads `.env` into the environment, if one exists.
 *
 * Node applies the same precedence as `--env-file`: a variable already present
 * in the real environment wins over the file. That is the behaviour this
 * needs. In CI and in production the platform supplies the configuration, and
 * a stale file left in an image must not be able to override it.
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
 * @returns The files that were found and loaded, in the order applied. Useful
 *   for diagnosing which configuration a process actually picked up.
 *
 * @example
 * ```ts
 * loadDotenv(); // ['/repo/.env']
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
