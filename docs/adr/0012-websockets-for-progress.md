# 0012. WebSockets for ingestion progress

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Ingestion takes seconds to minutes. Without feedback, a user cannot tell a slow
upload from a stuck one, and the interface has nothing honest to show.

The question is how the browser learns that something changed.

## Decision

Push updates over **Socket.IO**, through a Nest WebSocket gateway on the
`/ingestion` namespace.

A client subscribes to the document ids it cares about and joins one room per
document, so an event reaches exactly the sockets that asked for it rather than
being broadcast and filtered client-side.

Subscribing **acknowledges with each document's current state**, so a client
that connects after ingestion started is not left waiting for an event that has
already happened. Without that, there is a window where the interface knows
nothing and looks broken.

The processor **emits events; the gateway listens.** Ingestion has no opinion
about whether anyone is watching, which is what lets the worker run in its own
process.

## Alternatives considered

**Polling `GET /documents/{id}` every second.** Simplest, needs no new protocol,
and works through every proxy. It also spends one request per client per second
to learn "still working" almost every time, and bounds how fresh the interface
can be by the poll interval. For a handful of documents it is fine; it is the
fallback if WebSockets cannot connect, since the status is always readable from
the API.

**Server-sent events.** A genuinely good fit: one-way server-to-client is
exactly this problem, it is plain HTTP, and it reconnects on its own. Rejected
for one reason — the project needs a bidirectional channel shortly anyway, for
subscribe and unsubscribe here and for tool approval in the agent, and running
SSE now and WebSockets later means building the same thing twice. Had this been
the only real-time feature, SSE would have been the better answer.

**Long polling.** Works everywhere and is unpleasant to operate: connections
held open, timeouts to tune, and the same bidirectional gap as SSE.

## Consequences

- The interface shows real progress, and the status is correct whether the
  client connected before or after the work began.
- Events are scoped per document, so one client's subscription does not cost
  anything to another's.
- A subscription cap stops one client watching the entire corpus and being woken
  by all of it.
- Across several API replicas, Socket.IO needs its Redis adapter so a client on
  replica A hears about work done on replica B. Not needed for the
  single-process demo; enabled by configuration when it is.
- Delivery is not guaranteed. A client that misses an event re-reads the
  document. Progress is a convenience, and `documents.status` is the record.
