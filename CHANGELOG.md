# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added — guarding a public demo

M7's guardrails, brought forward because the deploy is imminent and a guardrail
added after the first abuse is a guardrail added too late.

- A **daily spend ceiling** (`DAILY_BUDGET_USD`) read from the usage ledger,
  which already records what every call cost. Past it, answering falls back to
  the mock and says so; ingestion is refused, because a document embedded by the
  mock would sit in the corpus returning confident nonsense for every future
  search. A ledger that cannot be read counts as exhausted.
- A **shared demo key** (`DEMO_API_KEY`), compared in constant time on digests,
  required by a global opt-out guard on every route but health — and on the
  progress websocket, which no HTTP guard reaches. The browser asks for it
  before making any request at all.
- **Per-client request limits** counted in Redis, in three tiers by what a
  request costs, with `Retry-After` and the project's usual error shape.
- **Resource caps**: `MAX_DOCUMENTS` alongside the existing `MAX_UPLOAD_MB`.
- A **line at boot** naming every guard, phrased so the dangerous states are the
  loud ones.
- Proof of what an uploaded document cannot do: a PDF carrying JavaScript three
  ways does not execute it, a renamed binary never reaches the PDF engine, a
  file is stored under its id and never its name, and markup from a document
  never becomes an element in a browser.
- `docs/security-and-guardrails.md`, including the gaps.

## [0.2.0] - 2026-11-01

### Added in M5

- Structured extraction as its own endpoints: `POST /extract` returns validated
  items with citations, `POST /extract/stream` sends one event per completed
  item, and `GET /extract/schemas` publishes the shapes the server knows.
- The schema registry moved to `packages/shared`, so one Zod definition
  constrains the model, validates every item and lays out the table. Three
  shapes: `api_endpoints`, `document_outline`, `faq_pairs`.
- One repair attempt: output that fails validation is sent back **with the
  validation error**, once. A second failure is a typed error rather than a
  third attempt. Items that fail are dropped, counted and reported.
- A table in the interface that fills a row at a time, with the columns taken
  from the server's schema rather than hard-coded, and a JSON download that
  carries the shape and the citations with the items.
- `docs/structured-output.md`; the extraction endpoints in `docs/api.md`; the
  streaming table in `docs/frontend.md`.

### Added in M4

- A tool-calling agent (`POST /agent`): the model chooses how to answer, in a
  loop bounded by `AGENT_MAX_STEPS`.
- Four tools — `search_docs`, `summarize_document` (map-reduce, with citations),
  `extract_structured` (against a server-held schema registry) and
  `create_ticket` (a mock tracker behind a real approval).
- Approval before anything irreversible: the loop does not execute
  `create_ticket` until the reader answers, and a denial is proved by counting
  rows rather than by reading the model's reply.
- Tool steps in the interface, collapsed, showing name, input, status and
  output; an approval prompt that shows the whole proposal before asking.
- `tickets` table, `AGENT_MAX_STEPS`, and `docs/agent-and-tools.md` with the
  loop's sequence diagram including approval.
- The mock provider is scripted to search once and then answer, so the tool step
  is visible with no API key.

## [0.1.0] - 2026-10-31

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

### Added in M3

- A document library in the web app: drag and drop or choose a file, watch it go
  from queued to ready over the WebSocket, see what is already held, retry a
  failure, delete. The first part of the product usable without `curl`, and it
  works identically against a real provider or the mock.
- Design-system primitives for it and for the chat that follows: `Progress`,
  `StatusBadge`, `Spinner`, `EmptyState`, `Dropzone`, `CitationChip`,
  `SidePanel`, `MessageBubble`, each with stories covering every state in both
  languages and axe running on all of them.
- Document endpoints in the typed RTK Query client, with socket events patching
  the cache rather than invalidating it — an invalidation would refetch the
  whole list on every progress tick to apply a change the event already carried.
- Specs for the whole milestone: `upload-ui`, `streaming-chat`,
  `citations-panel`, `i18n`.
- Streaming answers (`POST /chat`) in a conversation that remembers previous
  turns, with the conversation id and the citations sent as data parts in the
  stream — the citations before any text, so the sources panel renders while the
  answer is still being written.
- `conversations` and `messages` tables, and `GET`/`DELETE /conversations`.
  Citations are stored as a snapshot with the message, so an old conversation
  still shows the evidence it was answered from after the document is deleted.
- A chat interface: markers render as pressable citation chips, a side panel
  shows the passage each came from, markdown is sanitised, and Escape returns
  focus to the chip that opened the panel.
- `docs/frontend.md`, and ADRs for the state split and for Tailwind.

### Fixed

- The chat stream wrote its data parts before starting the message, so the
  client attributed them to a message of their own and rendered an empty
  assistant bubble above every answer.
- The answer's markdown renderers were rebuilt on every render, which remounted
  the whole subtree — replacing every citation chip with a new DOM node, so
  closing the sources panel restored focus to an element no longer in the
  document.
- **The ingestion queue was never consumed, in any process.** `RUN_WORKER` was
  declared inside `IngestionModule`, and Nest resolves a provider from the
  module the consumer belongs to — so the processor always read that module's
  hardcoded `false` and the value the entrypoint passed was ignored. Uploading
  through the API left a document in `queued` for ever. Every test passed,
  because every test called the processor directly. It is now supplied globally
  by the entrypoint, with no default, so a misconfigured process fails at
  startup instead of idling silently.
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
