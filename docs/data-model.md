# The data model

Every table, what each column is for, and why each index exists.

Today the schema holds only the migration that enables the `vector` extension,
which has to exist before any column can declare a vector type.

> **Status:** written in M1 and M2, alongside the code it describes.
> Documentation is committed with the feature, never batched at the end, so
> nothing here describes behaviour that does not exist yet.

## Planned contents

- An entity-relationship diagram.
- Each table and column, and why it is there.
- Indexes: HNSW on embeddings, GIN on text search, and what each one costs.
- Redis keys and queue names.
- The S3 key layout.
- The migration workflow.
