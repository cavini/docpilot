# Spec: Document upload

Status: implemented Milestone: M1

## Problem and goal

There is nowhere to put a document. Before anything can be searched or answered,
a user has to be able to hand the system a PDF, a Markdown file or a plain text
file, and get back something they can watch and refer to later.

Upload must be cheap to retry and impossible to duplicate by accident: people
drag the same file in twice, and re-embedding it would cost money and pollute
retrieval with twin passages that crowd out other sources.

## Behaviour

A user selects a file. The API validates it, stores the original, records it,
and queues it for processing. The response comes back immediately with a
document whose status is `queued`; processing happens in the background and is
reported separately.

Uploading a file whose bytes have been seen before returns the **existing**
document rather than creating a second one.

## API contract

### `POST /documents`

`multipart/form-data` with one field, `file`.

```http
POST /documents
Content-Type: multipart/form-data; boundary=...

--...
Content-Disposition: form-data; name="file"; filename="billing-api.pdf"
Content-Type: application/pdf
--...
```

**201 Created** — a new document was accepted:

```json
{
  "id": "0f8d7c2a-1b4e-4a6d-9c3f-2e5b8a1d6f40",
  "title": "billing-api",
  "sourceFilename": "billing-api.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 418233,
  "status": "queued",
  "progress": 0,
  "pageCount": null,
  "chunkCount": 0,
  "language": null,
  "error": null,
  "createdAt": "2026-10-30T22:14:03.118Z",
  "updatedAt": "2026-10-30T22:14:03.118Z"
}
```

**200 OK** — the same bytes were already uploaded; the existing document is
returned unchanged.

**400** `invalid_request` — unsupported type, empty file, or no file field.
**413** `payload_too_large` — larger than `MAX_UPLOAD_MB`.

### `GET /documents?limit=&cursor=`

**200** `{ "items": [...], "nextCursor": "..." | null }`, newest first.

### `GET /documents/:id`

**200** the document. **404** `not_found`.

### `DELETE /documents/:id`

**204**, and the chunks and the stored original go with it. **404** if unknown.

### `POST /documents/:id/retry`

**202** and the document returns to `queued`. **409** `conflict` if it is not in
`failed`. **404** if unknown.

## Acceptance criteria

**AC1.** Given a valid PDF under the size limit, when it is uploaded, then the
response is 201 with status `queued` and a job is enqueued.

**AC2.** Given a `.md` file, when it is uploaded, then it is accepted.

**AC3.** Given a `.txt` file, when it is uploaded, then it is accepted.

**AC4.** Given a file whose type is not PDF, Markdown or plain text, when it is
uploaded, then the response is 400 and nothing is stored.

**AC5.** Given a file larger than `MAX_UPLOAD_MB`, when it is uploaded, then the
response is 413 and nothing is stored.

**AC6.** Given an empty file, when it is uploaded, then the response is 400,
because there is nothing to extract and a zero-byte document would sit in
`ready` forever with no chunks.

**AC7.** Given a request with no `file` field, when it is posted, then the
response is 400.

**AC8.** Given a file whose bytes have already been uploaded, when it is
uploaded again, then the response is 200 with the existing document, no second
row is created, and no job is enqueued.

**AC9.** Given a file whose bytes match a document that previously `failed`,
when it is uploaded again, then it is reprocessed rather than returning the
failed document, because the failure may have been transient.

**AC10.** Given two files with identical content but different names, when both
are uploaded, then they deduplicate to one document, because the content is what
gets embedded.

**AC11.** Given an accepted upload, when it is stored, then the original bytes
are in object storage under a key derived from the document id, and the row
records that key.

**AC12.** Given an accepted upload, when the document is created, then its title
is the filename without its extension.

**AC13.** Given documents exist, when `GET /documents` is called, then they are
returned newest first and paginated.

**AC14.** Given a document, when it is deleted, then its chunks are gone, the
stored original is gone, and a later `GET` returns 404.

**AC15.** Given a document in `failed`, when retry is called, then it returns to
`queued` and a job is enqueued.

**AC16.** Given a document in `ready`, when retry is called, then the response
is 409 and nothing is enqueued.

**AC17.** Given storage is unreachable, when a file is uploaded, then the
response is 503 and no document row is left behind, because a row pointing at
bytes that were never stored can never succeed.

## Edge cases and failure modes

- **Storage succeeds, the insert fails.** The stored object is orphaned. It is
  deleted on the way out of the error path; if that also fails it is logged, and
  a future lifecycle rule can sweep it. The reverse order — insert first, store
  second — is worse: it leaves a row that can never be processed.
- **A lying `Content-Type`.** The declared type is checked against the file's
  own signature; a `.exe` renamed to `.pdf` is rejected.
- **A huge filename, or one with path separators.** The stored key is derived
  from the document id, never from user input, so the filename cannot escape its
  prefix. The original name is kept only as a label.
- **Concurrent upload of the same bytes.** A unique index on the hash makes the
  second insert fail, and that is caught and turned into the dedupe response.

## Non-goals

- OCR. A scanned PDF with no text layer produces no chunks and ends `failed`
  with a readable reason.
- Resumable or chunked uploads.
- Per-user ownership. This is a single-workspace demo.
- Virus scanning.

## Test plan

| AC                | Level          | File                                                             |
| ----------------- | -------------- | ---------------------------------------------------------------- |
| AC1–AC3, AC8–AC10 | integration    | `apps/api/test/integration/documents.spec.ts`                    |
| AC4–AC7           | unit           | `apps/api/src/documents/upload-validation.spec.ts`               |
| AC11, AC14, AC17  | integration    | `apps/api/test/integration/documents.spec.ts`                    |
| AC12, AC13        | unit + API e2e | `apps/api/src/documents/*.spec.ts`, `test/e2e/documents.spec.ts` |
| AC15, AC16        | API e2e        | `apps/api/test/e2e/documents.spec.ts`                            |
| all               | contract       | `apps/api/test/contract/documents.spec.ts`                       |

## Open questions

None outstanding. Deduplication returning 200 rather than 409 was chosen so a
client can treat upload as idempotent and simply use the document it gets back.
