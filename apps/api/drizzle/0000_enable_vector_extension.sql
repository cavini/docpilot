-- pgvector provides the `vector` column type, the distance operators used for
-- similarity search, and the HNSW index type. It has to exist before any table
-- can declare a vector column, so enabling it is the first migration rather
-- than a manual setup step: a fresh database reaches a working state through
-- `db:migrate` alone.
CREATE EXTENSION IF NOT EXISTS vector;
