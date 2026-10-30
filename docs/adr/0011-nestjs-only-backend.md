# 0011. All server-side code is NestJS

- **Status:** accepted
- **Date:** 2026-10-30

## Context

This project has four kinds of server-side code: an HTTP API, a background
worker that processes ingestion jobs, an MCP server that exposes the knowledge
base to editor clients, and a web front end that needs server-rendered pages.

Next.js can host backend logic directly, through route handlers and server
actions. That is convenient, and it is a trap here. Business logic placed behind
a route handler is reachable only over HTTP from the browser, so the worker and
the MCP server cannot call it; it has no dependency injection, so tests reach
for module mocks instead of substituted providers; and it ends up duplicated
once a second consumer appears.

The real question is where the rate limiter, the usage logging, the
prompt-injection guard and the retrieval cache live. Each has to apply to every
caller, whatever the entry point.

## Decision

**Every piece of server-side logic is a NestJS application.**

- `apps/api` is the HTTP application: REST controllers, the streaming chat
  endpoint, the agent, structured output, retrieval, ingestion, the WebSocket
  gateway and the GraphQL module.
- `apps/api/src/worker.ts` is a second entrypoint into the same codebase, booted
  with `createApplicationContext` so it has no HTTP listener. It runs the queue
  processors. `WORKER_MODE` decides whether they run inside the API process or
  in their own.
- `apps/mcp-server` is a standalone Nest application that speaks MCP over stdio
  and calls the HTTP API through a client generated from `openapi.json`.
- `apps/web` talks only to the API. It has no database driver and no model
  provider SDK among its dependencies, which is enforced by the fact that they
  are simply not installed there.

Explicitly ruled out: a standalone Express, Fastify, Koa or Hono server; Next.js
route handlers or server actions containing business logic, database access or
model calls; serverless functions holding business logic. Nest running on its
default Express adapter is fine, because that is Nest, not a hand-rolled Express
app.

## Why the worker is a Nest app rather than a script

A script would be shorter. It would also need its own copy of configuration
validation, its own logger, its own connection pooling and its own wiring of the
chunker and embedder it shares with the API. Running it as a Nest application
context means it gets all of that from the modules the API already uses, and a
queue processor can be tested with `@nestjs/testing` and substituted providers
exactly like a controller.

## Why the MCP server goes through HTTP rather than the database

It would be faster to give the MCP server a database connection and let it query
directly. It would also fork the rules: the rate limit, the usage logging, the
feature flags and the injection guards all live in the API, and a second path to
the same data would bypass every one of them. Going through HTTP keeps one place
where those rules apply, and means the same MCP server binary can point at
localhost or at the deployed demo by changing one variable.

## Alternatives considered

**Next.js route handlers for everything.** One deployable, no CORS, server
components can call server code directly. It cannot host a long-running queue
worker or a WebSocket gateway, has no dependency injection, and leaves the logic
unreachable from the worker and the MCP server. Rejected.

**A thin Fastify or Hono service.** Faster to start and less ceremony than Nest.
The ceremony is what is being bought here: modules, injected providers, guards,
interceptors and filters are how the cross-cutting concerns get applied once
instead of per route. Rejected.

**Nest for the API, a plain script for the worker.** Tempting, and how many
projects start. It duplicates configuration and wiring, and makes the processors
harder to test than the controllers. Rejected.

## Consequences

- One backend idiom across the whole repository: a module per feature, logic in
  services, validation in pipes, cross-cutting behaviour in guards, interceptors
  and filters.
- Guardrails, usage accounting and feature flags are written once and apply to
  REST, the streaming endpoint, WebSockets, GraphQL and MCP alike.
- More ceremony than a single-file handler, and a second process to think about
  in deployment. `WORKER_MODE=inline` collapses that to one service for the
  demo, and the same code scales out by changing one variable.
- The web app needs CORS and an API base URL rather than calling server code
  in-process. That is a real cost, paid in exchange for the API being equally
  usable by the mobile app and the MCP server.
