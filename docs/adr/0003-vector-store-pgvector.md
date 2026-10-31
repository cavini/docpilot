# 0003. pgvector rather than a dedicated vector database

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Retrieval needs to find passages whose embeddings are close to a question's.
That needs somewhere to keep a few thousand to a few million vectors and search
them quickly.

It also needs something the obvious alternatives are worse at. DocPilot's
retrieval is **hybrid**: vector similarity fused with full-text search, because
an exact function name or error code is found by keyword search and blurred by
an embedding. And an answer has to carry a citation, which means every vector
has to be joined back to its document, heading path and page number.

So the real question is not "which store searches vectors fastest" but "where do
vectors, keyword search and relational metadata live so that one query can use
all three".

## Decision

Use **PostgreSQL with pgvector**, in the same database as everything else.

- `chunks.embedding` is a `vector(1536)` column with an HNSW index using
  `vector_cosine_ops`.
- `chunks.tsv` is a generated `tsvector` with a GIN index.
- Both sit in the same row as `document_id`, `heading_path`, `page_start` and
  the rest of what a citation needs.

A hybrid query is therefore one statement against one database, joined to the
document in the same plan. No cross-store fan-out, no second consistency model,
and a deletion cascades to embeddings through an ordinary foreign key.

## Alternatives considered

**Pinecone.** Managed, scales further than this will ever need, and good at the
one thing it does. It is a second system with its own account, bill, SDK and
failure mode, and it holds no relational data — so every search becomes "query
Pinecone, collect ids, query Postgres to hydrate them", with two stores to keep
in step. Deleting a document means deleting from both and handling the case
where one half succeeds. Rejected: the coordination cost is real and the scale
that would justify it is not.

**Qdrant or Weaviate, self-hosted.** No vendor account, and both support hybrid
search natively, which is a genuine advantage over doing the fusion myself.
Still a second stateful service to run, back up and upgrade, and still a second
copy of the metadata. Rejected for this project's size; this is the alternative
I would revisit first if the corpus grew past what one Postgres can hold
comfortably.

**SQLite with `sqlite-vec`.** Delightful for a local demo and genuinely fast. It
would not survive the deployment this project is heading for, where the API and
worker are separate processes that both write.

**No vector search; keyword search only.** Cheaper, simpler, and no embedding
bill. It also fails at the thing the product is for: "how do I authenticate?"
has to find a passage that says "exchange your client credentials for a bearer
token", and no keyword overlap connects them. Rejected, but the inverse —
embeddings only, no keyword search — is rejected for the mirror-image reason,
which is why retrieval is hybrid.

## Consequences

- One database to run, back up and reason about. `docker compose up` is the
  whole dependency.
- A hybrid query, a filter by document, and the metadata a citation needs are
  all available in a single statement.
- Postgres becomes the scaling bottleneck for retrieval. HNSW index build time
  and memory grow with the corpus, and at some size the right answer is a
  dedicated store. That size is far beyond this project, and the interface to
  change is the retrieval service.
- The embedding width is fixed in the schema and the index is built for it.
  Changing the embedding model is a migration plus a re-embedding of the whole
  corpus, which `docs/rag-pipeline.md` describes rather than pretends away.
