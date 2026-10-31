# 0013. RTK Query for server state, `useChat` for the conversation

- **Status:** accepted
- **Date:** 2026-10-31

## Context

The interface has two kinds of state and they behave nothing alike.

**Documents, health and feature flags** are server state with a request/response
shape: fetch, cache, show stale while revalidating, invalidate when something
changes. The hard parts are caching and invalidation.

**A conversation** is a stream. A message exists before it is complete, grows
token by token, can be aborted half-way, and carries typed data parts beside its
text. There is no "response" to cache — the thing being rendered is a partial
one.

## Decision

Two owners, split along that line.

**RTK Query** owns documents, health and flags. The store is already there for
UI state, the client is typed from the same `openapi.json` the contract tests
validate against, and tag-based invalidation expresses "an upload changes the
list" directly.

**`useChat`** from the AI SDK owns the conversation. It holds the message list,
the status (`ready`, `submitted`, `streaming`, `error`), the abort handle, and
the parsing of the UI message stream — including the custom data parts this API
writes.

**Chat is deliberately not an RTK Query endpoint.** Two caches over the same
data would fight over who owns a half-arrived message, and only one of them
understands what that is.

### Socket events patch the cache rather than invalidating it

Ingestion progress is written into the cached document list with
`updateQueryData`. Invalidating would refetch the whole list on every progress
tick — four or more requests per document — to apply a change the event already
carried in full.

This is also why `ingestion.completed` carries everything ingestion determined
rather than only what changed: a client patching from the event needs the whole
final row, and a field left out shows up as a hole in the interface until
something unrelated causes a refetch. That happened with `language`.

## Alternatives considered

**RTK Query for everything, with a custom streaming `queryFn`.** One state
library, one mental model, and `onCacheEntryAdded` can consume a stream. It
would mean reimplementing what `useChat` already does — parsing the UI message
stream, tracking status, handling abort, reconciling data parts with their
message — against a protocol the server produces with the SDK's own helpers.
Rejected: the risk is not the code, it is that the two ends drift and the
failure mode is a message that silently renders wrong.

**`useChat` for everything.** It is not a cache and does not claim to be.
Rejected immediately.

**Zustand or Jotai instead of Redux Toolkit.** Both are lighter and pleasanter
for UI state. Neither brings a data-fetching layer, so the caching and
invalidation would be hand-rolled — which is the part that is actually hard.
Rejected, and RTK Query's `createApi` is the reason Redux is here at all.

**Server Components fetching directly.** Would mean the Next.js server talking
to Postgres or to the API with business logic in a route handler, which
[ADR 0011](./0011-nestjs-only-backend.md) rules out. The pages are server
components; the data comes from the browser to Nest.

## Consequences

- Each kind of state is handled by something built for it.
- Two libraries rather than one, so a reader has to learn where each piece
  lives. The rule is one sentence — _streaming belongs to `useChat`, everything
  else to RTK Query_ — and it has not needed an exception.
- The two never share data, so there is no synchronisation problem between them.
  A conversation references documents by id only.
- Server state is typed from the published contract, so a change the server
  makes without regenerating the spec fails the contract tests rather than the
  interface.
