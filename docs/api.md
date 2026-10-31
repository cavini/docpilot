# The HTTP API

Every endpoint, with real requests and responses.

The machine-readable version is
[`apps/api/openapi.json`](../apps/api/openapi.json), generated from the code
rather than written by hand, and checked in CI against a fresh regeneration so
it cannot drift. Run `pnpm dev` and open <http://localhost:3001/docs> for the
browsable version.

This page covers what is implemented. Endpoints arriving in later milestones
(streaming chat, tools, GraphQL) are documented when they ship.

## Conventions

Base URL in development is `http://localhost:3001`. There is **no
authentication** — the brief's scope is a single-user portfolio project, and
adding auth would be theatre rather than a boundary. Everything that would
change under multi-tenancy is listed in
[`security-and-guardrails.md`](./security-and-guardrails.md).

### Every failure has one shape

```json
{
  "error": {
    "code": "not_found",
    "message": "document 7f3a9c0e-… was not found",
    "requestId": "6f6cf7c5-d7c3-4281-8c89-c67912abade4",
    "details": { "resource": "document", "id": "7f3a9c0e-…" }
  }
}
```

**Branch on `code`, never on `message`.** The code is stable once shipped; the
message is for humans and may be reworded. `details` appears only when it tells
the caller something it can act on.

`requestId` is on every log line for that request and echoed in the
`x-request-id` response header, so quoting it in a bug report is enough to find
everything that happened. An **inbound** `x-request-id` is honoured rather than
replaced, so a trace survives the hop from another service.

Codes the API raises deliberately:

| `code`                   | HTTP | Means                                                |
| ------------------------ | ---- | ---------------------------------------------------- |
| `invalid_request`        | 400  | Understood, not acceptable. Retrying unchanged fails |
| `not_found`              | 404  | The named resource does not exist                    |
| `conflict`               | 409  | Conflicts with current state                         |
| `payload_too_large`      | 413  | Over `MAX_UPLOAD_MB`                                 |
| `dependency_unavailable` | 503  | Postgres, Redis, storage or a provider is failing    |

Two more come from the framework rather than from domain code. Request bodies
are validated by a global pipe, and a DTO rejection surfaces as
**`bad_request`** (400) with the failing constraint as the message —
`topK must not be greater than 50`. The pipe runs with `whitelist` on, so an
unknown property is stripped rather than quietly accepted.

Anything genuinely unexpected is **`internal_error`** (500) with a fixed
message. The real error and its stack go to the log, never to the client: an
unhandled error's message is as likely to contain a connection string as
anything useful.

503 rather than 500 for a failing dependency, because it is the one class of
failure where retrying is reasonable, and because it points at infrastructure
instead of at code.

## Health

### `GET /health/live`

Liveness only. Answers 200 as long as the process is up — it probes nothing, so
it never fails because a dependency is down. This is what a container
orchestrator should poll: restarting the API will not fix Postgres.

```json
{ "status": "ok" }
```

Deliberately bare. Anything else in this body would be something that could
fail, and this endpoint's whole value is that it cannot.

### `GET /health`

Readiness, with each dependency probed.

```bash
curl -s localhost:3001/health | jq
```

```json
{
  "status": "ok",
  "version": "0.0.0",
  "uptimeSeconds": 568,
  "checkedAt": "2026-10-31T02:21:46.803Z",
  "dependencies": {
    "database": { "status": "ok", "latencyMs": 19 },
    "redis": { "status": "ok", "latencyMs": 5 },
    "storage": { "status": "ok", "latencyMs": 8 }
  }
}
```

`status` is the worst of its dependencies: `ok`, `degraded`, or `down`. A
dependency that failed reports `{ "status": "down", "error": "…" }` in place of
its latency.

Returns **503 with the same body** when the roll-up is `down`, naming which
dependency and why. The status code is for the orchestrator; the body is for the
person diagnosing it, and both are worth having.

This caught a real bug in the web client, which treated the 503 as a transport
error and threw the diagnosis away. The fix was to accept both statuses and read
the body either way — see [`frontend.md`](./frontend.md).

## Feature flags

### `GET /feature-flags`

```json
[
  {
    "key": "rerank",
    "enabled": false,
    "description": "Re-score retrieved chunks with a second model before answering"
  },
  {
    "key": "graphql",
    "enabled": true,
    "description": "Serve the GraphQL read API"
  },
  {
    "key": "agentTools",
    "enabled": true,
    "description": "Let the assistant call tools rather than only answering"
  },
  {
    "key": "publicUploads",
    "enabled": true,
    "description": "Accept document uploads from unauthenticated callers"
  }
]
```

Every capability behind a flag, with its current value, so the UI can hide what
is off rather than offer a control that fails. The `description` ships with the
flag so the client never has to hard-code a label for a flag it does not
recognise — a flag added on the server shows up in the UI without a front-end
release.

Flags are read from the environment (`FF_RERANK`, `FF_GRAPHQL`,
`FF_AGENT_TOOLS`, `FF_PUBLIC_UPLOADS`) at boot and validated with the rest of
the configuration, so a typo fails startup rather than silently disabling a
feature.

## Documents

### `POST /documents`

Upload a PDF, Markdown or plain text file as `multipart/form-data`.

```bash
curl -s -X POST localhost:3001/documents -F file=@docs/specs/chunking.md | jq
```

```json
{
  "id": "7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b",
  "title": "chunking",
  "sourceFilename": "chunking.md",
  "mimeType": "text/markdown",
  "sizeBytes": 9241,
  "status": "queued",
  "progress": 0,
  "language": null,
  "error": null,
  "pageCount": null,
  "chunkCount": 0,
  "createdAt": "2026-10-30T12:00:00.000Z",
  "updatedAt": "2026-10-30T12:00:00.000Z"
}
```

**201** for a new document, **200** for one already held — the SHA-256 of the
content is a unique key, so the same bytes are the same document whatever the
filename. That makes upload idempotent: a client retrying after a timeout gets
the original rather than a duplicate or a 409. A document that previously
**failed** is reprocessed instead, because the failure may have been transient.

Ingestion is asynchronous. The response is the document in `queued`; watch
`status` by polling `GET /documents/{id}` or, better, over
[WebSocket](#websocket-events).

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| 400    | Not a readable PDF, zero bytes, or an unsupported type |
| 413    | Over `MAX_UPLOAD_MB`                                   |

The declared `Content-Type` is treated as a claim, not a fact: the file's own
signature is checked first, the extension second, the header last. A `.pdf`
whose bytes are not a PDF is rejected before anything is stored.

### `GET /documents`

Newest first, cursor-paginated.

```bash
curl -s 'localhost:3001/documents?limit=20' | jq
```

```json
{
  "items": [
    {
      "id": "7f3a9c0e-…",
      "title": "chunking",
      "status": "ready",
      "progress": 100,
      "language": "english",
      "chunkCount": 14,
      "pageCount": null,
      "…": "…"
    }
  ],
  "nextCursor": "2026-10-30T12:00:00.000Z"
}
```

`nextCursor` is `null` on the last page; pass it back as `cursor`. `limit`
defaults to 20 and is capped at 100.

**Keyset pagination, not offsets**, because a document uploaded while someone is
paginating shifts every offset, so a row appears twice or not at all. The cursor
is the sort key itself — `createdAt`, descending — so it stays correct whatever
gets inserted.

One row more than `limit` is fetched to answer "is there another page" without a
second `COUNT(*)` over the table.

The cursor is `createdAt` alone, with no tie-break on id. Two documents created
in the same millisecond could straddle a page boundary and one be skipped. In
practice uploads are seconds apart and the fix is a compound cursor, which is
worth doing when the listing is paginated by something other than a human
scrolling.

### `GET /documents/{id}`

One document, same shape as above. 404 if it does not exist.

### `POST /documents/{id}/retry`

**202**, with the document back in `queued`. Accepted rather than OK because the
work has not happened yet — the same reason upload is asynchronous.

**409** `conflict` if the document did not fail: reprocessing a `ready` document
would silently rebuild its chunks, and reprocessing a `queued` one would
duplicate work. **404** if it does not exist.

The job id is the document id, so a double click cannot queue the same document
twice.

### `DELETE /documents/{id}`

**204**, no body. Deletes the row, its chunks (by foreign key) and the stored
object. **404** for an id that does not exist.

If the row is deleted but removing the stored object fails, the request still
succeeds: the document is gone as far as the caller is concerned, and an
orphaned object is a cleanup problem rather than a failed delete. It is logged
with the storage key so it can be swept.

## Search

### `POST /search`

Hybrid retrieval with no model call for the answer. This is the endpoint to
reach for when debugging a bad answer: it shows exactly what the model would
have been given.

```bash
curl -s -X POST localhost:3001/search \
  -H 'content-type: application/json' \
  -d '{"query": "X-RateLimit-Reset", "topK": 5}' | jq
```

```json
{
  "results": [
    {
      "chunkId": "c1d2e3f4-…",
      "documentId": "7f3a9c0e-…",
      "documentTitle": "lumen-api",
      "content": "Every endpoint allows **120 requests per minute** per client …",
      "headingPath": "Lumen API > Rate limiting",
      "pageStart": null,
      "pageEnd": null,
      "score": 0.02946236559139785,
      "vectorRank": 15,
      "keywordRank": 2
    }
  ],
  "tookMs": 27,
  "cached": false
}
```

| Field         | Notes                                             |
| ------------- | ------------------------------------------------- |
| `query`       | Required, non-empty                               |
| `topK`        | 1–50, default 8                                   |
| `documentIds` | Optional; restricts the search to those documents |

`vectorRank` and `keywordRank` are the result's position in each method's list,
`null` when that method did not return it at all. They are the reason a result's
placement is explicable. The example above is the case hybrid search exists for:
vector search ranked that chunk **15th** and keyword search 2nd, and fusion put
it second overall.

`score` is a sum of reciprocal ranks — see
[ADR 0006](./adr/0006-hybrid-search-rrf.md). It is comparable **within one
search** and meaningless across searches, so it is not a confidence and should
not be shown as a percentage.

`cached` reports whether the **query embedding** came from Redis. Results are
never cached: the corpus changes on every upload, and a stale result set is
worse than a slow one. A repeated question skips the embedding round trip, which
is the part that costs money.

### `POST /ask`

Retrieve, then answer from what was retrieved, with citations.

```bash
curl -s -X POST localhost:3001/ask \
  -H 'content-type: application/json' \
  -d '{"question": "How do I authenticate?"}' | jq
```

```json
{
  "answer": "Exchange your client credentials for a bearer token at POST /auth/token, then send it as `Authorization: Bearer …` on every request [1]. Tokens expire after an hour [2].",
  "citations": [
    {
      "n": 1,
      "chunkId": "c1d2e3f4-…",
      "documentId": "7f3a9c0e-…",
      "documentTitle": "Lumen API",
      "headingPath": "Authentication",
      "pageStart": null,
      "pageEnd": null,
      "snippet": "Call POST /auth/token with your client id and secret …"
    }
  ],
  "usage": { "inputTokens": 1842, "outputTokens": 96, "costUsd": 0.000321 }
}
```

| Field         | Notes                                       |
| ------------- | ------------------------------------------- |
| `question`    | Required, non-empty                         |
| `topK`        | 1–20, default 8                             |
| `documentIds` | Optional; answers from those documents only |

**Every `[n]` in `answer` resolves to an entry in `citations`.** A marker the
model invented for a passage it was not given is removed from the text rather
than returned pointing at nothing — a citation that cannot be clicked is worse
than no citation, because it looks like evidence. Only the chunks actually cited
are returned, renumbered from 1, so the response carries no passages the answer
does not rely on.

When retrieval returns nothing at all, the answer is exactly
`"I do not know based on the provided documents."` with an empty `citations`,
returned **without a model call** — there is nothing to answer from, and paying
a provider to say so would be waste. That is **200, not 404**: the request
succeeded and the honest answer is "not in the corpus".

The same string is what the system prompt instructs the model to return when the
passages it was given do not contain the answer, so a client has one sentinel to
recognise rather than two. **That second path is the usual one.** There is no
similarity floor: vector search returns its nearest neighbours however far away
they are, so a question about something entirely absent still retrieves passages
— they are simply irrelevant. Refusing is therefore the model's job, which is
why the instruction is explicit and why [`evals.md`](./evals.md) measures
refusal as a metric of its own rather than folding it into accuracy.

A threshold is tempting and was left out deliberately: the cutoff would be a
number tuned against a handful of queries, and it fails in the expensive
direction — a correct passage just below the line becomes a refusal, which reads
as the product not knowing something it demonstrably does.

`usage.costUsd` is computed from the provider's published prices at the model
actually used, and the same numbers are written to `llm_usage`, so spend is a
database query rather than a dashboard login.

Set `LLM_PROVIDER=mock` to exercise the whole path with no key and no cost. The
mock returns an obviously canned answer with a real citation, through the **same
factory and the same call path** as a live provider.

## WebSocket events

Socket.IO on namespace `/ingestion`. A client joins one room per document, so an
event reaches exactly the sockets watching that document and no others.

```ts
const socket = io('http://localhost:3001/ingestion');

// The acknowledgement carries each document's current state.
socket.emit('subscribe', { documentIds: [documentId] }, (ack) => ack.ok);

socket.on('ingestion.progress', (e) => e.status); // parsing | chunking | embedding
socket.on('ingestion.completed', (e) => e.chunkCount);
socket.on('ingestion.failed', (e) => e.error);

socket.emit('unsubscribe', { documentIds: [documentId] });
```

| Event                 | Payload                                                  |
| --------------------- | -------------------------------------------------------- |
| `ingestion.progress`  | `{ documentId, status, progress }`                       |
| `ingestion.completed` | `{ documentId, status: 'ready', chunkCount, pageCount }` |
| `ingestion.failed`    | `{ documentId, status: 'failed', error }`                |

`subscribe` acknowledges with each document's **current** state, so a client
that connects after ingestion started is not left waiting for an event that
already fired — the common case, because the upload response and the socket
subscription race.

A malformed `subscribe` returns `{ ok: false, error }` rather than dropping the
connection: one client sending nonsense must not cost it the updates it is
otherwise entitled to.

Why events travel through Redis rather than in-process, and what happens to a
client that misses one, is in [`realtime.md`](./realtime.md).

## Rate limits

There are none yet. The endpoint that needs one is `/ask`, where each request
costs money, and the limit belongs with the authentication that identifies who
to limit — both arrive together in M8. Until then the only ceiling is
`MAX_UPLOAD_MB`.

## Not yet implemented

| Endpoint              | Milestone | What it adds                            |
| --------------------- | --------- | --------------------------------------- |
| `POST /chat`          | M3        | Streamed answers over SSE, with history |
| Tool calling          | M4        | The model acting, not just answering    |
| `POST /graphql`       | M5        | Behind `FF_GRAPHQL`                     |
| Structured extraction | M6        | Schema-constrained output               |
