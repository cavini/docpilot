# Spec: Structured extraction

Status: implemented Milestone: M5

## Problem and goal

M4 gave the agent an `extract_structured` tool. That is the right shape when the
model is deciding what to do, and the wrong one when a caller already knows:
asking a model to decide to call a tool, in order to run an extraction you asked
for by name, is two model calls to do one thing.

The goal is extraction as a first-class endpoint — name a schema, get validated
items — and an interface that fills a table as they arrive rather than showing a
spinner until the last one lands.

## Behaviour

**A registry the server owns.** The caller names a schema; the server holds the
definitions. A caller-supplied schema would be a caller-supplied contract, and
would make the endpoint a way to ask the server for arbitrary shapes.

Three schemas in M5:

| Name               | What it extracts                                        |
| ------------------ | ------------------------------------------------------- |
| `api_endpoints`    | Method, path, summary, whether it needs a token         |
| `document_outline` | The headings, with their level and a one-line gist      |
| `faq_pairs`        | Question-and-answer pairs the documents already contain |

The registry moves to `packages/shared`, because the web app needs the same
definitions to render a table of each shape. One definition, used by the server
to validate and by the client to lay out.

**Retrieval first.** The passages relevant to the schema are retrieved, then
extraction runs over them. Extracting from the whole corpus would be a
summarisation problem wearing a different hat, and would cost accordingly.

**One repair retry.** A response that fails validation is sent back to the model
**with the validation error**, once. Models correct a malformed field when told
which field and why; they do not correct it when asked again identically. A
second failure is a typed error, not a third attempt.

**Streaming, as completed items.** Items arrive one at a time and the table
fills. A partially-arrived item is not shown — half a row is noise, and the
reader cannot tell it apart from a row with missing data.

**Downloadable.** The result is offered as JSON, because the reason to ask for
structured data is usually to use it somewhere else.

## API contract

### `GET /extract/schemas`

What the server knows, so a client can offer the choice without hard-coding it.

```json
{
  "schemas": [
    {
      "name": "api_endpoints",
      "title": "API endpoints",
      "description": "Every HTTP endpoint the documents describe…",
      "fields": [
        {
          "name": "method",
          "kind": "enum",
          "label": "Method",
          "options": ["GET", "POST"]
        },
        { "name": "path", "kind": "string", "label": "Path" }
      ]
    }
  ]
}
```

`fields` is what the table renders. It comes from the schema rather than from
the client, so adding a schema needs no front-end release.

### `POST /extract`

```json
{ "schema": "api_endpoints", "documentId": "7f3a9c0e-…", "query": "auth" }
```

Returns the whole result:

```json
{
  "schema": "api_endpoints",
  "items": [{ "method": "POST", "path": "/auth/token", … }],
  "citations": [{ "n": 1, "chunkId": "…", "documentTitle": "lumen-api" }],
  "dropped": 0,
  "repaired": false,
  "usage": { "inputTokens": 1842, "outputTokens": 96, "costUsd": 0.000321 }
}
```

`repaired` says whether the first attempt failed validation. A caller watching
that number climb is watching a schema that needs rewording.

### `POST /extract/stream`

The same request, answered as server-sent events, one per completed item:

```
data: {"type":"schema","schema":"api_endpoints"}

data: {"type":"item","item":{"method":"POST","path":"/auth/token",…}}

data: {"type":"done","citations":[…],"dropped":0,"repaired":false}

data: [DONE]
```

A hand-rolled event shape rather than the AI SDK's UI message stream: this is
not a chat, there is no message to assemble, and a caller consuming it with
`EventSource` should not have to understand a protocol built for conversation.

## Acceptance criteria

**AC1.** Given a corpus describing endpoints, when `api_endpoints` is extracted,
then every item validates against the schema.

**AC2.** Given a schema name the registry does not know, when it is requested,
then the response is 400 and names the schemas that exist.

**AC3.** Given the model returns something invalid, when it is validated, then
it is sent back once with the validation error.

**AC4.** Given the repair attempt succeeds, when it is returned, then `repaired`
is true and the items are the repaired ones.

**AC5.** Given the repair attempt also fails, when it is returned, then the
response is a typed error rather than a third attempt.

**AC6.** Given nothing in the corpus matches, when extraction runs, then an
empty list is returned rather than invented items.

**AC7.** Given `documentId`, when extraction runs, then only that document is
read.

**AC8.** Given a result, when it is returned, then it carries citations back to
the passages it came from.

**AC9.** Given a call, when it completes, then its tokens and cost are recorded
in the usage ledger.

**AC10.** Given `GET /extract/schemas`, when it is called, then every registered
schema is listed with the fields a table needs.

**AC11.** Given the streaming endpoint, when items are extracted, then each
arrives as its own event as it completes.

**AC12.** Given the streaming endpoint, when an item is still arriving, then it
is **not** emitted — half a row is indistinguishable from a row with missing
data.

**AC13.** Given a streamed extraction, when the reader watches, then the table
fills a row at a time rather than appearing at the end.

**AC14.** Given a finished extraction, when the reader downloads it, then they
get the items as JSON.

**AC15.** Given the page in pt-BR, when it renders, then the controls and column
headings are localised.

## Edge cases and failure modes

| Situation                               | Behaviour                                                   |
| --------------------------------------- | ----------------------------------------------------------- |
| Duplicate items across passages         | Deduplicated on the schema's identity                       |
| An item the schema almost matches       | Dropped and counted, as in M4                               |
| The provider is down                    | 503 with the shape every failure has                        |
| The stream breaks mid-extraction        | Items already sent stand; the client is told it ended early |
| A schema with no items in the corpus    | Empty list, `dropped: 0`                                    |
| The reader downloads before it finishes | Whatever has arrived, which is what they can see            |

## Non-goals

- Caller-supplied schemas, for the reason above.
- More than one schema per call.
- Storing an extraction. The caller gets it; what happens next is theirs.
- Extracting from the whole corpus rather than from retrieved passages.
- Editing the result in the interface.

## Test plan

| AC                       | Level                   | File                                                 |
| ------------------------ | ----------------------- | ---------------------------------------------------- |
| registry shape           | unit                    | `packages/shared/src/schemas/*.test.ts`              |
| AC2–AC6                  | unit with scripted mock | `apps/api/src/extraction/extraction.service.spec.ts` |
| AC1, AC7–AC9, AC11, AC12 | integration             | `apps/api/test/integration/extraction.spec.ts`       |
| AC2, AC10                | API e2e                 | `apps/api/test/e2e/extraction.spec.ts`               |
| response shapes          | contract                | `apps/api/test/contract/extraction.spec.ts`          |
| AC2, AC8, AC10, AC13     | unit (jsdom)            | `apps/web/src/features/extraction/*.test.ts(x)`      |
| AC13                     | component (browser)     | `apps/web/cypress/component/extraction-table.cy.tsx` |
| AC13–AC15                | browser e2e             | `apps/web/e2e/extraction.spec.ts`                    |

AC3 to AC5 need a model that returns something invalid on demand, and then
something valid. No real provider can be asked for that sequence; the scripted
mock is told.

AC13 needs a stream with real time between its events. Playwright's request
interception can only answer with a whole body, which would pass whether the
table filled a row at a time or all at once at the end, so the browser suite
runs against a small server (`apps/web/e2e/support/extract-stub.mjs`) that
writes one event per interval over a real socket.

## Open questions

Whether one repair attempt is the right number. One is the point where the cost
is a single extra call and the benefit is the common case — a model correcting a
field it was told about. Two would double the worst-case cost to catch a case
nobody has seen yet. Revisit if `repaired` turns out to be high.
