import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadDotenv } from './load-dotenv.js';

/**
 * These tests cover which files are found and in what order.
 *
 * They deliberately do not assert on `process.env`. Reading the file is
 * Node's `process.loadEnvFile`, which writes to the real process environment,
 * and Jest gives each test a copy of `process.env`, so the effect is not
 * observable from inside the sandbox. Node's parsing and its
 * environment-wins precedence are Node's to guarantee; what this module adds
 * is the search, and that is what is tested here.
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

  it('AC4: applies an app-local .env after the root one, so it can override a single value', () => {
    writeFileSync(join(root, '.env'), 'DOCPILOT_PROBE=root\n');
    writeFileSync(join(appDir, '.env'), 'DOCPILOT_PROBE=local\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(root, '.env'), resolve(appDir, '.env')]);
  });

  it('AC5: finds an app-local .env on its own', () => {
    writeFileSync(join(appDir, '.env'), 'DOCPILOT_PROBE=local\n');

    expect(loadDotenv(appDir)).toStrictEqual([resolve(appDir, '.env')]);
  });
});
