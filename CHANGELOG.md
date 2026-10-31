# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- pnpm workspace with Turborepo, shared strict TypeScript configuration, one
  ESLint flat config for the whole repository, Prettier, and a lint-staged
  pre-commit hook.
- Docker Compose with PostgreSQL 17 plus pgvector, Redis configured for the job
  queue, and S3 emulation. `pnpm infra:up` waits until every service is
  genuinely usable, including the document bucket.
- `packages/shared`: the health contract and the dependency status rollup.
- NestJS API: environment validated with Zod before startup, structured logging
  with request ids, typed domain errors behind a global exception filter,
  Postgres with pgvector, Redis, document storage, health endpoints, feature
  flags, Swagger at `/docs` with a committed OpenAPI spec, and a worker
  entrypoint.
- First migration, enabling the `vector` extension.
- Next.js web application: Tailwind, English and Brazilian Portuguese, a Redux
  Toolkit store with a typed API client, and a landing page reporting the API's
  health.
- `packages/ui`: design tokens, a `Button`, and Storybook with interaction tests
  that run in Chromium and check accessibility on every story.
- `packages/testing`: seeded factories and a deterministic embedding model, so
  the suite needs no API key.
- Every test level: unit, integration against real containers, API end-to-end,
  contract against the OpenAPI spec, component in a browser, and browser
  journeys with an accessibility check.
- GitHub Actions workflow running all of it, with no secrets.

### Added in M1

- Document upload (`POST /documents`) for PDF, Markdown and plain text, with
  size and type validation, content-hash deduplication, and storage of the
  original.
- Parsers for all three formats. PDFs are extracted page by page so citations
  can name a page; Markdown keeps its heading hierarchy.
- Structure-aware chunking with overlap, counted in real tokens, keeping code
  blocks whole where they fit.
- Batched embedding through the AI SDK, with retries and a usage ledger
  recording tokens, cost and latency for every call.
- A BullMQ ingestion pipeline with retries, backoff and idempotent re-runs,
  runnable inside the API or as its own process.
- Live ingestion progress over WebSockets, scoped per document.
- `documents`, `chunks` and `llm_usage` tables, with an HNSW index for vector
  search and a generated `tsvector` for keyword search.
- A demo corpus in English and Portuguese, and `pnpm seed`.

### Added in M2

- Hybrid search (`POST /search`): vector and keyword search run concurrently and
  their rankings are fused with Reciprocal Rank Fusion. Each result reports its
  position in both methods, so a bad result shows whether retrieval or the model
  was at fault.
- Grounded answers (`POST /ask`): the retrieved passages, an instruction to use
  only them, and citation markers resolved server-side against the chunks
  actually retrieved. A marker the model invented is removed rather than
  returned pointing at nothing.
- Query embeddings cached in Redis, keyed by question and model. Results are
  deliberately not cached, because the corpus changes on every upload.
- `LLM_PROVIDER=mock`, which answers through the same factory and call path as a
  real provider, so the whole product runs with no API key and no bill.
- Failure responses are now in the published OpenAPI spec, and the contract
  suite validates real error bodies against them.
- `docs/api.md`, the retrieval half of `docs/rag-pipeline.md`, and ADRs for the
  AI SDK choice and for RRF.

### Fixed

- Keyword search had been a sequential scan since the heading-path fix:
  replacing the generated `tsv` column dropped the GIN index with it, and
  `drizzle-kit` could not see the cascade. Migration `0003` recreates it.
- Vector search was not using the HNSW index either. Joining `documents` for the
  `ready` filter inside the nearest-neighbour query made Postgres materialise
  the join and sort, returning identical rows without the index. The approximate
  search now runs on `chunks` alone and the join happens after it.
- The keyword predicate read its text-search configuration from the row, which
  no GIN index can serve. It now expands into one language-guarded branch per
  configuration, with the same semantics.
- Both query plans are now asserted in the integration suite, because a lost
  index changes nothing about the rows returned and is invisible to every test
  that only checks results.
- `POST /documents/:id/retry` returns 202, but the published spec declared 200.
- Redis reported as down on every fresh process: with the offline queue
  disabled, a lazily created client could not issue its first command.
- The web application showed "API unreachable" when the API answered 503,
  discarding the body that said which dependency had failed.
- The generated OpenAPI spec was reformatted by the pre-commit hook, so the
  regenerate-and-diff check in CI could never pass.
- Coverage measured with V8 rather than Babel instrumentation, which had been
  counting unreachable branches emitted for decorators.
- Chunks were invisible to search by their own section heading: the passage
  under "Authentication" never contains the word, so searching for it returned
  nothing. The heading path now reaches both the keyword index and the embedded
  text.
- `.env` was never loaded, so `pnpm dev` started the web app and left the API
  dead on a missing `DATABASE_URL`.
- A parser failure threw synchronously from a method typed as returning a
  promise, so a caller using `.catch` would have missed it.
