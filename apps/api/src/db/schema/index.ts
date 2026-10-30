/**
 * Drizzle table definitions.
 *
 * Every table lives in its own file here and is re-exported below, so that
 * `drizzle-kit` sees the whole schema from one entry point and the generated
 * migrations stay in step with the code.
 *
 * The first migration carries no tables: it enables the `vector` extension,
 * which has to exist in the database before any column can be declared with a
 * vector type. Tables arrive with the ingestion pipeline.
 */

export {};
