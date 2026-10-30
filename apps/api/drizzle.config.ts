import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside the Nest application, so it does not go through the
// validated config. Read .env directly when one is present; CI and production
// supply DATABASE_URL in the environment instead.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file. Fine when DATABASE_URL is already exported.
}

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
