# Testing

How DocPilot is tested, which level covers what, and how code that calls a
language model is tested without a key, a cost, or a flake.

The reasoning behind the choices is in [ADR 0010](./adr/0010-test-strategy.md);
this page is the practical guide.

## How a feature gets built

Every feature follows the same loop: **spec, failing test, implementation,
refactor, docs.**

1. **Spec first.** `docs/specs/<feature>.md`, committed on its own, using the
   template in [`specs/README.md`](./specs/README.md). It states the problem,
   the observable behaviour, the API contract, and numbered acceptance criteria
   written as Given/When/Then.

2. **Contract next.** Zod schemas and types in `packages/shared`, and the Nest
   DTOs with their Swagger decorators, so the tests and the implementation
   compile against the same shapes.

3. **Red, green, refactor** for anything with logic in it. The test is named
   after the acceptance criterion it covers:

   ```ts
   it('AC3: overlaps consecutive chunks by about 75 tokens', () => {
   ```

   Because every criterion appears in a test name, `grep -r AC3` finds the test
   that proves it. That traceability is the point: a reviewer can read a spec
   and check each line is actually enforced, instead of taking a coverage
   percentage on trust.

   Contract tests are the one level that carries no numbers — what they assert
   belongs to the published spec rather than to a feature, and a local `AC3`
   there would collide with a feature spec's `AC3` and break the lookup.

4. **Close the spec.** Status `implemented`, test plan pointing at the real
   files, documentation updated in the same commit or the next one.

Glue code — modules, controllers, layout — may be tested after the fact. Every
acceptance criterion is covered before a milestone closes.

## The levels

| Level                     | Tool                            | Lives in                                                | Run with                |
| ------------------------- | ------------------------------- | ------------------------------------------------------- | ----------------------- |
| Unit (backend)            | Jest + `@nestjs/testing`        | `apps/api/src/**/*.spec.ts`                             | `pnpm test`             |
| Unit (frontend, packages) | Vitest                          | `apps/web/**/*.test.tsx`, `packages/*/src/**/*.test.ts` | `pnpm test`             |
| Integration               | Jest + Testcontainers           | `apps/api/test/integration`                             | `pnpm test:integration` |
| API end-to-end            | Jest + Supertest                | `apps/api/test/e2e`                                     | `pnpm test:api-e2e`     |
| Contract                  | Jest + Ajv                      | `apps/api/test/contract`                                | `pnpm test:contract`    |
| Component (browser)       | Cypress Component Testing       | `apps/web/cypress/component`                            | `pnpm test:component`   |
| Component (states)        | Storybook + Vitest browser mode | `packages/ui/**/*.stories.tsx`                          | `pnpm test:storybook`   |
| Browser end-to-end        | Playwright                      | `apps/web/e2e`                                          | `pnpm test:e2e`         |

`pnpm test:all` runs them in that order, which is also CI's order: the cheapest
and most specific failures report first.

### What belongs where

- **Unit** when the behaviour is a function of its inputs: the chunker, rank
  fusion, citation mapping, the prompt builder, the cost calculator, a guard.
- **Integration** when the behaviour depends on a real database or service:
  retrieval SQL, index usage, queue processors, cache invalidation.
- **API end-to-end** when the behaviour depends on the assembled application:
  status codes, the error envelope, validation, the streaming protocol.
- **Contract** when a client depends on the exact response shape — including
  **error** shapes: the spec promises `{ error: { code, message, requestId } }`,
  and a promise a test does not check is a comment.
- **Component (browser)** when the behaviour depends on real layout or focus.
- **Browser end-to-end** when the behaviour spans pages or services.

If a test fits at two levels, write it at the lower one.

## Running the suites

```bash
pnpm test              # every unit suite, no containers; the one to leave in watch
pnpm test:watch        # the TDD loop
pnpm test:integration  # starts Postgres, Redis and S3 containers
pnpm test:api-e2e      # the whole Nest app over HTTP
pnpm test:contract     # responses against the committed openapi.json
pnpm test:component    # Cypress, single components in Chromium
pnpm test:storybook    # every story's play function, plus an a11y check
pnpm test:e2e          # Playwright journeys
pnpm test:all          # all of the above, in CI order
pnpm test:coverage     # unit and integration with thresholds enforced
```

**None of this needs an API key.** Every model call goes through a mock.

The container-backed suites need Docker running. They start their own containers
through Testcontainers rather than reusing `docker compose`, so a test run
cannot touch development data.

## Testing code that calls a language model

A model is non-deterministic, costs money, and needs a secret. All three are
fatal in a test suite, so none of them are present in one.

`LLM_PROVIDER=mock` wires the AI SDK's mock models through **the same provider
factory the application uses in production**. There is no `if (test)` branch in
business code, because a branch like that means the path under test is not the
path that ships.

Embeddings use two different mocks, deliberately:

- `createDeterministicEmbeddingModel()` hashes text into a stable unit vector.
  It proves batching, storage and caching work. It is **not semantic**: two
  paraphrases hash to unrelated vectors, so it cannot say anything about
  retrieval quality.
- **Recorded real embeddings** of a small fixture corpus, generated once and
  committed, for the tests that are about quality.

Using the first where the second is needed produces retrieval tests that pass
and mean nothing.

## Test data

Factories live in `packages/testing` and let a test state only the fields it
cares about:

```ts
healthResponseFactory.build({ status: 'down' });
```

Adding a required field to a type then means updating one builder rather than
every test that constructs the object, and a test's assertions stay about the
thing it is testing. The underlying generator is seeded with a fixed value,
because random data makes a failure reproduce only sometimes, which is worse
than no data at all.

## Accessibility

Accessibility is asserted, not reviewed:

- Every Storybook story runs an axe check, configured to fail rather than warn.
- Each main page has a Playwright axe check against WCAG 2.1 A and AA.
- Component tests assert on roles and accessible names rather than on CSS
  classes, which is also what makes them survive a restyle.

## Coverage

Thresholds are enforced in configuration, not watched by hand: **80% of lines
and 75% of branches** on the API's core modules, `packages/shared` and the MCP
server, and **70% of lines** on the web components and the design system.
Generated code, bootstrap files and migrations are excluded.

The number is a floor, not a goal. A test with no assertion raises coverage and
proves nothing, so review looks at what is asserted rather than at the
percentage.

Both Jest and Vitest measure with **V8's native coverage** rather than Babel
instrumentation. Babel counts the branches SWC emits for decorators and
parameter injection, which no test can reach: a fully exercised Nest service
scored about 42% branches while an undecorated module beside it scored 100%.
Measuring the code as it actually runs makes the number mean something.

Coverage is collected only from code that makes decisions. Nest modules,
injection tokens, DTOs, route components and framework wiring are declarative or
are exercised by the end-to-end suites; counting them would dilute the number
that does carry signal.

## When a bug is found

Reproduce it first, then fix it:

```
test(web): reproduce empty stream crash
fix(web): handle empty stream
```

The failing test comes first so that it is known to fail for the right reason. A
fix committed without one has no evidence it addressed the reported problem.

## Flaky tests

A flaky test is fixed or removed, never retried until it passes. A retry turns a
real intermittent bug into noise.

Two causes have come up so far, both now avoided:

- **Shared containers with parallel workers.** The container-backed suites run
  with `maxWorkers: 1`, because they share one database.
- **A half-constructed client left a socket open.** An integration test that
  built a deliberately broken Redis client kept Jest alive after the run. The
  failure path is covered by unit tests with substituted dependencies, which is
  the right level for it; the integration test now checks something only real
  infrastructure can answer.

## Evals are not tests

[Evals](./evals.md) measure answer and retrieval **quality** against a real
model. They are non-deterministic, cost money, and report scores rather than
pass or fail.

Tests gate every change; evals run deliberately, with the cost stated first, and
track whether a change to chunking, retrieval or the prompt made answers better
or worse. They are not part of `pnpm test:all` and are not required in CI.
