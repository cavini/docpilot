# 0007. BullMQ on Redis for ingestion

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Ingesting a document means reading it from storage, parsing it, chunking it, and
calling an embedding provider — seconds to minutes of work that costs money and
fails in ways worth recovering from. It cannot happen inside the upload request:
the browser would wait, a timeout would lose the work, and a restart mid-flight
would leave a document half-processed forever.

So the work needs a queue. The requirements are ordinary: retries with backoff,
a bounded number of attempts, visibility into what is in flight, and survival
across a restart.

## Decision

Use **BullMQ on Redis**, through `@nestjs/bullmq`.

- Three attempts with exponential backoff from one second.
- The job id is the document id, which makes enqueuing idempotent: a double
  click cannot queue the same document twice.
- `WORKER_MODE` decides where processors run — `inline` in the API process,
  `separate` as its own process, `off` not at all.

**Redis holds the queue's truth** about attempts and retries. `documents.status`
and `documents.progress` are a durable, user-facing **projection** of it. A user
looking at a document should not need the queue running to find out what
happened to it, and the queue should not be the system of record for something a
person reads.

## Why not a Postgres queue with `SELECT … FOR UPDATE SKIP LOCKED`

This is the strongest alternative and deserves a straight answer.

`FOR UPDATE SKIP LOCKED` is a genuinely good queue. It needs no second service,
the job state is visible in ordinary SQL, and enqueuing a job is in the same
transaction as the row that caused it — which removes an entire class of bug
where the row commits and the job does not.

It was rejected for one reason: **Redis is already there.** The project needs it
for the retrieval cache and for rate-limiter storage regardless, so the "one
fewer service" argument does not apply here. Given that, BullMQ supplies
retries, backoff, concurrency control, delayed jobs, progress reporting and a
visible job history that would otherwise be hand-written and hand-tested.

If Redis were not already a dependency, a Postgres queue would be the right
choice, and the transactional enqueue would make it the better one. That is
worth saying plainly rather than pretending the decision was obvious.

## Other alternatives

**A cron job polling for queued documents.** Simplest possible, and the latency
is whatever the poll interval is. No concurrency control and no backoff without
writing both. Rejected.

**A hosted queue such as SQS.** Durable and someone else's problem to run. It is
an account, a bill and a region, for a project whose whole point is that it runs
from `docker compose`. Rejected.

**Processing inline in the request with a long timeout.** Tempting for a demo
and wrong for anything else: a restart loses the work, the browser holds a
connection for minutes, and nothing can be retried.

## Consequences

- An upload returns immediately, and the heavy work survives a restart: a job in
  flight when the process died is handed to the next worker.
- A transient failure costs a retry rather than a document. An unreadable file
  is failed immediately instead, because it would fail identically every time
  and retrying only delays the answer.
- Scaling ingestion out is `WORKER_MODE=separate` and a second process, not a
  rewrite.
- Redis is now load-bearing for ingestion. If it is down, uploads still succeed
  and documents sit `queued` until it returns — which is the right failure:
  nothing is lost, it just waits.
- Enqueue is not transactional with the insert. A crash in the gap between
  inserting the document and adding the job leaves a document stuck in `queued`.
  `POST /documents/{id}/retry` recovers it; a Postgres queue would not have the
  gap at all.
