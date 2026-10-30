# 0002. Drizzle ORM over Prisma

- **Status:** accepted
- **Date:** 2026-10-30

## Context

The retrieval layer is the heart of this product, and it is mostly SQL. A hybrid
search query has to:

- Order by vector distance using a pgvector operator (`<=>` for cosine).
- Rank full-text matches with `ts_rank_cd` over a `tsvector` column.
- Fuse those two ranked lists with Reciprocal Rank Fusion, which means a query
  with CTEs, window functions and a join.
- Use an HNSW index, and be checked with `EXPLAIN` to confirm it does.

So the data-access tool has to treat `vector` and `tsvector` as ordinary typed
columns, let me write the ranking SQL directly, and keep that SQL readable in
the repository. Being able to point at the query and explain it line by line
matters as much as it being correct.

Everything else is unremarkable: a handful of tables, inserts, cascading deletes
and paginated reads.

## Decision

Use **Drizzle ORM** with the `node-postgres` driver, and **Drizzle Kit** for
migrations.

- Tables are declared in TypeScript under `apps/api/src/db/schema/`.
- `casing: 'snake_case'` maps `camelCase` in TypeScript to `snake_case` in
  Postgres, so neither side adopts the other's convention.
- Migrations are generated into `apps/api/drizzle/` and committed. Applying them
  is `pnpm db:migrate`.
- Where the query builder cannot express something, `sql` templates drop to raw
  SQL while keeping the result typed.

The connection pool is a Nest provider that is closed on shutdown, and the query
builder is injected through a token rather than imported as a singleton, so a
test can substitute it.

## Alternatives considered

**Prisma.** Better ergonomics for ordinary CRUD, a schema language that reads
well, and the strongest migration tooling of the two. The problem is the part of
this project that matters most: Prisma has no native `vector` or `tsvector`
type, so those columns need `Unsupported("vector(1536)")`, which makes them
invisible to the typed client and unusable in a Prisma query. Vector search then
has to go through `$queryRaw`, which returns `unknown` and gives up the type
safety that was the reason to choose Prisma. The retrieval queries would be raw
strings sitting beside an ORM that cannot see them. Rejected.

**TypeORM.** Mature, and used widely with Nest. Decorator-driven entities carry
more implicit behaviour than I want to explain, its migration story is weaker,
and the project's direction has been uncertain. Rejected.

**No ORM: `pg` and hand-written SQL.** Honest, and the retrieval queries would
look exactly the same. It also means hand-writing every insert and select, and
hand-maintaining the types describing each row, which is where the mistakes
would be. Drizzle generates those types from one schema declaration, so the
boring queries are typed for free and the interesting ones are still plain SQL.
Rejected, though it is the closest alternative.

**Kysely.** A very good query builder with the same "SQL stays visible"
philosophy. It is a query builder only: migrations and schema introspection are
separate concerns to solve. Drizzle covers both with one tool. Rejected for
scope, not quality.

## Consequences

- The hybrid search query lives in the repository as SQL that can be read,
  explained and run in `psql`.
- pgvector and `tsvector` columns are first-class and typed, with no escape
  hatches.
- Migrations are plain SQL files, so a reviewer can see exactly what will run
  against the database. The trade-off is that Drizzle Kit's generated diffs need
  reading before being committed; it is less opinionated than Prisma Migrate
  about destructive changes.
- Fewer people know Drizzle than Prisma, so the schema and queries need comments
  that explain intent rather than assuming familiarity.
