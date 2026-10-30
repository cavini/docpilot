# Real-time updates

How ingestion progress reaches the browser without polling.

> **Status:** written in M1 and M3, alongside the code it describes.
> Documentation is committed with the feature, never batched at the end, so
> nothing here describes behaviour that does not exist yet.

## Planned contents

- The WebSocket gateway, its events and their payloads.
- Bridging queue events to connected clients.
- Scaling across processes with the Redis adapter.
- Why WebSockets here rather than polling or server-sent events.
