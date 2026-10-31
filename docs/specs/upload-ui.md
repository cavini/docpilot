# Spec: Upload and document library

Status: implemented Milestone: M3

## Problem and goal

Every capability built so far is reachable only with `curl`. A reviewer opening
the app sees a health panel, which proves the plumbing works and demonstrates
nothing about the product.

The goal is the first half of a usable interface: put a document in, watch it
become searchable, see what is already there, and remove it. No model is
involved, so this works identically against a real provider or the mock.

## Behaviour

**The library.** Documents newest first, each showing its title, type, size,
page or chunk count, language, and status. Empty state explains what to do
rather than showing an empty table.

**Adding one.** A drop zone accepts a drag, a click opens the file picker, and
both accept PDF, Markdown and plain text. The file is validated client-side for
type and size before any request, so an obviously wrong file is refused without
a round trip — but the server validates again, because a client check is a
convenience and never a guarantee.

**Watching it.** From the moment the upload returns, the document's row shows
live progress: `queued` → `parsing` → `chunking` → `embedding` → `ready`, with a
bar. Progress arrives over the WebSocket already built in M1. A document that
fails shows why, with a retry button.

**Removing one.** Delete asks for confirmation, because it also destroys the
passages and the stored original.

**Re-uploading the same file** is not an error. The server deduplicates by
content hash and returns the existing document; the UI says so rather than
appearing to do nothing.

## API contract

Nothing new. This consumes what M1 published:

| Operation | Endpoint                                                   |
| --------- | ---------------------------------------------------------- |
| List      | `GET /documents?limit&cursor`                              |
| Upload    | `POST /documents` (multipart) → 201 new, 200 duplicate     |
| Read one  | `GET /documents/{id}`                                      |
| Retry     | `POST /documents/{id}/retry` → 202                         |
| Delete    | `DELETE /documents/{id}` → 204                             |
| Progress  | Socket.IO `/ingestion`, `subscribe` with `{ documentIds }` |

Events are `ingestion.progress`, `ingestion.completed`, `ingestion.failed`, as
documented in [`api.md`](../api.md#websocket-events).

## Acceptance criteria

**AC1.** Given no documents, when the library loads, then an empty state
explains how to add one rather than showing an empty list.

**AC2.** Given a valid file dropped on the zone, when it is released, then it
uploads and appears in the library immediately, in `queued`.

**AC3.** Given a file chosen through the file picker, when it is selected, then
it behaves identically to a drop.

**AC4.** Given a file whose extension is not supported, when it is selected,
then it is refused in the UI with the reason, and no request is made.

**AC5.** Given a file larger than the configured limit, when it is selected,
then it is refused in the UI with the limit named, and no request is made.

**AC6.** Given a document being ingested, when a progress event arrives, then
its row updates without a refresh and without polling.

**AC7.** Given a document that reaches `ready`, when the event arrives, then the
library shows its chunk count.

**AC8.** Given a document that fails, when the event arrives, then its row shows
the reason and offers retry.

**AC9.** Given a failed document, when retry is pressed, then it returns to
`queued` and progress resumes.

**AC10.** Given a document, when delete is pressed, then it is confirmed before
anything is sent.

**AC11.** Given a file already in the corpus, when it is uploaded again, then
the UI reports it was already held rather than silently doing nothing.

**AC12.** Given the API is unreachable, when the library loads, then it says so
and offers retry, rather than showing an empty library.

**AC13.** Given a drag over the zone, when it is hovering, then the zone shows
it will accept the drop.

**AC14.** Given the page in pt-BR, when it renders, then every string, date and
file size is localised.

## Edge cases and failure modes

| Situation                  | Behaviour                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Socket drops mid-ingestion | Reconnect and re-subscribe; the acknowledgement carries current state, so nothing is missed         |
| Socket never connects      | Progress falls back to nothing; status is still correct on reload. The app is usable, just not live |
| Upload rejected 413        | The server's message is shown, not a generic failure                                                |
| Two files dropped at once  | Both upload; each gets its own row and its own progress                                             |
| Delete while ingesting     | Allowed; the job exits quietly, as M1 specified                                                     |
| Zero-byte file             | Refused client-side, and by the server                                                              |

## Non-goals

- Folder upload, or more than a handful of files at a time.
- Editing a document's title or metadata.
- Previewing the original file.
- Pagination controls. The cursor exists in the API; the UI loads one page until
  the corpus is big enough to need more.

## Test plan

| AC                             | Level               | File                                                        |
| ------------------------------ | ------------------- | ----------------------------------------------------------- |
| AC4, AC5                       | unit                | `apps/web/src/features/documents/validate-file.test.ts`     |
| AC14 formatting                | unit                | `apps/web/src/features/documents/format.test.ts`            |
| AC1, AC2, AC4, AC5, AC11, AC12 | component (RTL)     | `apps/web/src/features/documents/document-library.test.tsx` |
| AC6–AC10                       | component (RTL)     | `apps/web/src/features/documents/document-row.test.tsx`     |
| AC2, AC3, AC13                 | component (browser) | `packages/ui/src/dropzone/dropzone.stories.tsx`             |
| all states                     | Storybook           | `packages/ui/src/**/*.stories.tsx`                          |
| AC1, AC7, AC8, AC10, AC14      | browser e2e         | `apps/web/e2e/documents.spec.ts`                            |

**AC4 and AC5 are tested through a drop, not the file picker.** The picker
already filters by the input's `accept`, so an unsupported file can never arrive
that way — which is exactly why the check exists: a drop bypasses `accept` and
hands the page whatever was dragged onto it. Testing it through the picker
passes while asserting nothing, which is how the first version of that test was
wrong.

**AC6 and AC9** — live progress and retry — are asserted at the component level
with the event already applied. That a real socket event reaches a client is the
API's `test/e2e/ingestion-progress.spec.ts`; that the queue is consumed at all
is `test/integration/worker.spec.ts`.

## Open questions

None blocking. Whether the library becomes a sidebar beside the chat or stays
its own page is a layout decision made while building.
