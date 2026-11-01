import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadDotenv } from './load-dotenv.js';

/**
 * These tests cover which files are found, in what order, and - crucially -
 * which value actually wins.
 *
 * The last part needs a child process. `process.loadEnvFile` writes to the
 * real process environment and Jest hands each test a copy, so precedence is
 * not observable from inside the sandbox. An earlier version of this file
 * said so and asserted only the search order, which is how it came to
 * document the opposite of what the module did: the comment claimed a later
 * file could override an earlier one, and `loadEnvFile` overwrites nothing
 * that is already set.
 */
describe('loadDotenv', () => {
  let root: string;
  let appDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'docpilot-dotenv-'));
    appDir = join(root, 'apps', 'api');
    mkdirSync(appDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('AC1: finds the .env at the repository root', () => {
    writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=root\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(root, '.env')]);
  });

  it('AC2: returns nothing when there is no .env, because an image ships without one', () => {
    expect(loadDotenv(appDir)).toStrictEqual([]);
  });

  it('AC3: does not throw when there is no .env', () => {
    expect(() => loadDotenv(appDir)).not.toThrow();
  });

  it('AC4: searches the app-local .env before the root one, because the first wins', () => {
    writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=root\n');
    writeFileSync(join(appDir, '.env'), 'DOCPILOT_PROBE=local\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(appDir, '.env'), resolve(root, '.env')]);
  });

  it('prefers a .env.local over the .env beside it', () => {
    // Somewhere to keep a value a tool rewrites. `neon env pull` overwrites
    // DATABASE_URL in .env every time it runs.
    writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=root\n');
    writeFileSync(join(root, '.env.local'), 'DOCPILOT_PROBE=root-local\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(root, '.env.local'), resolve(root, '.env')]);
  });

  it('orders every file it knows about, most specific first', () => {
    for (const [dir, name] of [
      [root, '.env'],
      [root, '.env.local'],
      [appDir, '.env'],
      [appDir, '.env.local'],
    ] as const) {
      writeFileSync(join(dir, name), 'DOCPILOT_PROBE=x\n');
    }

    expect(loadDotenv(appDir)).toStrictEqual([
      resolve(appDir, '.env.local'),
      resolve(appDir, '.env'),
      resolve(root, '.env.local'),
      resolve(root, '.env'),
    ]);
  });

  it('AC5: finds an app-local .env on its own', () => {
    writeFileSync(join(appDir, '.env'), 'DOCPILOT_PROBE=local\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(appDir, '.env')]);
  });

  describe('which value actually wins', () => {
    /**
     * Runs `loadDotenv` in a child process and reports what the variable
     * ended up as.
     *
     * A child, because Jest's copy of `process.env` hides the effect - which
     * is exactly why the bug this guards against survived.
     */
    function probeIn(dir: string): string {
      const script = `
        const { loadDotenv } = require(${JSON.stringify(resolve(__dirname, 'load-dotenv.ts'))});
        loadDotenv(${JSON.stringify(dir)});
        process.stdout.write(String(process.env.DOCPILOT_PROBE));
      `;

      return execFileSync(process.execPath, ['--experimental-strip-types', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, DOCPILOT_PROBE: undefined },
      }).trim();
    }

    it('lets an app-local .env beat the root one', () => {
      writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=root\n');
      writeFileSync(join(appDir, '.env'), 'DOCPILOT_PROBE=local\n');

      expect(probeIn(appDir)).toBe('local');
    });

    it('lets .env.local beat the .env beside it', () => {
      // The case that matters in practice: `neon env pull` rewrites .env, and
      // without this local development would silently start talking to the
      // production database.
      writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=pulled-by-a-tool\n');
      writeFileSync(join(root, '.env.local'), 'DOCPILOT_PROBE=mine\n');

      expect(probeIn(appDir)).toBe('mine');
    });

    it('lets the real environment beat every file', () => {
      writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=from-a-file\n');

      const output = execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '-e',
          `const { loadDotenv } = require(${JSON.stringify(resolve(__dirname, 'load-dotenv.ts'))});
           loadDotenv(${JSON.stringify(appDir)});
           process.stdout.write(String(process.env.DOCPILOT_PROBE));`,
        ],
        { encoding: 'utf8', env: { ...process.env, DOCPILOT_PROBE: 'from-the-platform' } },
      ).trim();

      // In production the platform supplies the configuration, and a stale
      // file left in an image must not be able to override it.
      expect(output).toBe('from-the-platform');
    });
  });
});
