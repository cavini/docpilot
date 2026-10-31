# Lumen API

Lumen is a payments platform. This document covers the parts of the HTTP API
every integration needs: getting a token, staying inside the rate limits, paging
through collections, and understanding errors.

## Authentication

Lumen uses OAuth client credentials. Call `POST /auth/token` with your client id
and client secret to obtain a bearer token:

```http
POST /auth/token
Content-Type: application/json

{ "client_id": "lum_live_8f2a", "client_secret": "..." }
```

The response contains an `access_token` and an `expires_in` of **3600 seconds**.
Send the token on every subsequent request:

```http
Authorization: Bearer <access_token>
```

A request without a token, or with an expired one, returns `401` with the error
code `unauthenticated`. Refresh the token before it expires rather than waiting
for a failure; Lumen does not issue refresh tokens, so refreshing means calling
`POST /auth/token` again.

### Rotating a secret

Create the replacement secret first with `POST /auth/secrets`, deploy it, then
revoke the old one with `DELETE /auth/secrets/{id}`. Both secrets are valid in
between, so rotation needs no downtime. A revoked secret stops working
immediately.

## Rate limiting

Every endpoint allows **120 requests per minute** per client, measured over a
sliding window. Three headers accompany every response:

| Header                  | Meaning                         |
| ----------------------- | ------------------------------- |
| `X-RateLimit-Limit`     | Requests allowed in the window  |
| `X-RateLimit-Remaining` | Requests left                   |
| `X-RateLimit-Reset`     | Seconds until the window resets |

Exceeding the limit returns `429` with the code `rate_limited` and a
`Retry-After` header giving the seconds to wait. Retry after that delay with
exponential backoff and jitter; retrying immediately will simply fail again and
counts against the next window.

Bulk endpoints have their own, lower limit of 10 requests per minute. They are
documented individually.

## Pagination

Collections are paginated with a cursor, not a page number:

```http
GET /invoices?limit=50&cursor=inv_8f2a9c
```

`limit` defaults to 25 and may not exceed 100. The response carries a
`next_cursor`, which is `null` on the final page. Pass it back unchanged.

Cursors are opaque. Do not parse or construct one; a cursor from one endpoint is
meaningless to another. Cursor paging is used rather than offsets because an
offset shifts when a record is created while you are paging, so rows get skipped
or returned twice.

## Errors

Every failed response has the same shape:

```json
{
  "error": {
    "code": "invoice_already_paid",
    "message": "Invoice inv_8f2a9c has already been paid.",
    "request_id": "req_01K8Z2M4Q7"
  }
}
```

Branch on `code`, which is stable. The `message` is for humans and may be
reworded without notice. Quote `request_id` in any support request: it appears
on every log line for that request.

| Status | Code                     | Meaning                                   |
| ------ | ------------------------ | ----------------------------------------- |
| 400    | `invalid_request`        | The request was malformed                 |
| 401    | `unauthenticated`        | No token, or an expired one               |
| 403    | `forbidden`              | The token lacks the required scope        |
| 404    | `not_found`              | No such resource                          |
| 409    | `conflict`               | The request contradicts the current state |
| 429    | `rate_limited`           | Too many requests                         |
| 503    | `dependency_unavailable` | A Lumen dependency is failing; retry      |

A `5xx` is safe to retry. A `4xx` other than `429` is not: it will fail
identically until the request changes.

## Idempotency

Any `POST` accepts an `Idempotency-Key` header. Lumen stores the response
against that key for **24 hours** and replays it if the same key arrives again,
so a retry after a network timeout cannot create a second charge.

Use a fresh UUID per logical operation. Reusing a key for a different request
body returns `409` with the code `idempotency_key_reused`.
