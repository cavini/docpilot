# Spec: Live ingestion progress

Status: implemented Milestone: M1

## Problem and goal

Ingestion takes seconds to minutes. Without feedback, a user cannot tell a slow
upload from a stuck one, and the usual answer — poll every second — wastes a
request per client per second to say "still working" almost every time.

The goal is for the browser to be **told** when something changes.

## Behaviour

A client opens a WebSocket connection and subscribes to the document ids it
cares about. As the pipeline advances, the server pushes an event per change.
When the document finishes or fails, a final event says so and the client can
stop listening.

A client that connects late is not left blind: subscribing replies with the
document's current state immediately, so the interface is correct whether it
connected before or after the work started.

## API contract

Socket.IO, namespace `/ingestion`.

**Client → server**

| Event         | Payload                     | Meaning               |
| ------------- | --------------------------- | --------------------- |
| `subscribe`   | `{ documentIds: string[] }` | Watch these documents |
| `unsubscribe` | `{ documentIds: string[] }` | Stop watching         |

`subscribe` acknowledges with the current state of each requested document, so
there is no window in which the client knows nothing.

**Server → client**

| Event                 | Payload                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `ingestion.progress`  | `{ documentId, status, progress }`                                 |
| `ingestion.completed` | `{ documentId, status: 'ready', chunkCount, pageCount, language }` |
| `ingestion.failed`    | `{ documentId, status: 'failed', error }`                          |

## Acceptance criteria

**AC1.** Given a client subscribed to a document, when the document's stage
changes, then the client receives `ingestion.progress` with the new status.

**AC2.** Given a client subscribed to a document, when the document reaches
`ready`, then the client receives `ingestion.completed` carrying the chunk
count.

**AC3.** Given a client subscribed to a document, when the document fails, then
the client receives `ingestion.failed` carrying the reason.

**AC4.** Given a client subscribes to a document that is already `ready`, when
it subscribes, then the acknowledgement carries the current state, so no event
is missed by connecting late.

**AC5.** Given a client subscribed only to document A, when document B changes,
then the client receives nothing, because events are scoped per document.

**AC6.** Given a client unsubscribes, when the document changes, then it
receives nothing further.

**AC7.** Given a `subscribe` payload that is not a list of document ids, when it
arrives, then it is rejected with an error event and the connection stays open,
because a malformed message from one client must not drop it.

**AC8.** Given a client subscribes to more document ids than the allowed limit,
when it subscribes, then it is rejected, so one client cannot subscribe to
everything.

**AC9.** Given a client disconnects, when it is gone, then its subscriptions are
released.

**AC10.** Given `WORKER_MODE=separate`, when the worker process advances a job,
then a client connected to the API process still receives the events, because
the bridge is queue events over Redis rather than an in-process emitter.

## Edge cases and failure modes

- **Redis unavailable.** Events stop. The documents still process if the worker
  is already running, and the interface falls back to the document's stored
  status on the next page load. Progress is a convenience, not the record.
- **A flood of progress events.** Updates are emitted on stage change and at
  most a few times within a stage, not per chunk.
- **Multiple API replicas.** Socket.IO's Redis adapter is required so a client
  connected to replica A hears about work done by replica B. Not needed for the
  single-process demo; the adapter is enabled by configuration.

## Non-goals

- Guaranteed delivery. A client that misses an event re-reads the document.
- Bidirectional control, such as cancelling a job over the socket.
- Authentication per socket beyond the demo key. Single-workspace demo.

## Test plan

| AC            | Level       | File                                              |
| ------------- | ----------- | ------------------------------------------------- |
| AC1–AC4       | API e2e     | `apps/api/test/e2e/ingestion-progress.spec.ts`    |
| AC5, AC6, AC9 | API e2e     | `apps/api/test/e2e/ingestion-progress.spec.ts`    |
| AC7, AC8      | unit        | `apps/api/src/ingestion/progress.gateway.spec.ts` |
| AC10          | integration | `apps/api/test/integration/ingestion.spec.ts`     |

## Open questions

Whether the browser should fall back to polling when the socket cannot connect.
Deferred: the status is always readable from `GET /documents/:id`, so the
interface degrades to a correct-but-static view, which is acceptable for now.
