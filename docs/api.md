# The HTTP API

Every endpoint, with real requests and responses.

Until this is filled in, the API documents itself: run `pnpm dev` and open
<http://localhost:3001/docs>, or read the committed
[`apps/api/openapi.json`](../apps/api/openapi.json).

> **Status:** written in M1 onwards, alongside the code it describes.
> Documentation is committed with the feature, never batched at the end, so
> nothing here describes behaviour that does not exist yet.

## Planned contents

- Each endpoint: method, path, authentication, examples, errors, limits.
- The streaming protocol, and how to consume it.
- WebSocket events.
- Rate limits and what a 429 looks like.
