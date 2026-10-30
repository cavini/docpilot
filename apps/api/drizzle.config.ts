import { defineConfig } from 'drizzle-kit';

import { loadDotenv } from './src/config/load-dotenv';

// drizzle-kit runs outside the Nest application, so it does not go through the
// validated config. The same .env rules apply: the real environment wins, and
// a missing file is not an error.
loadDotenv();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL is required to generate or run migrations. Copy .env.example to .env, or export it.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  // Columns are snake_case in Postgres and camelCase in TypeScript, and this
  // maps between them so neither side has to use the other's convention.
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
