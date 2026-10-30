# 0010. Test strategy: which runner, which level, and why two browser tools

- **Status:** accepted
- **Date:** 2026-10-30

## Context

This project has to be convincing about correctness, and the usual shortcut —
one big end-to-end suite — is slow, flaky and bad at saying what broke. It also
has an unusual constraint: a large part of the behaviour depends on a language
model, which is non-deterministic, costs money per call, and needs a key that
cannot be in CI.

So the strategy has to answer three questions: which runner each workspace uses,
which level a given behaviour is tested at, and how to make model-dependent code
testable at all.

## Decision

### Jest for NestJS, Vitest everywhere else

Each ecosystem's default, rather than one runner forced on both.

**Jest** runs the backend. It is what `@nestjs/testing` and the Nest
documentation assume, and `@nestjs/testing`'s module builder with
`overrideProvider` is the natural way to substitute a dependency in a DI-based
application.

Nest 12 publishes ESM only, and Jest refuses to `require` an ES module inside
its sandbox even on a Node that supports it natively — `jest-util` explicitly
overrides `process.features.require_module` to `false`. The suites therefore run
with `--experimental-vm-modules`, which is also what the Nest 12 starter does.
Transformation is `@swc/jest` rather than `ts-jest`: an order of magnitude
faster, and it handles the legacy decorators and `emitDecoratorMetadata` that
Nest's injection depends on.

**Vitest** runs the web app and the packages. It is ESM-native, shares Vite's
transform pipeline with the application, and its watch mode is fast enough to
leave running while writing a component.

### The levels, and what belongs at each

| Level               | Runner                   | Answers                                                                             |
| ------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Unit                | Jest / Vitest            | Does this function or service do the right thing with its dependencies substituted? |
| Integration         | Jest + Testcontainers    | Does this module work against real Postgres, Redis and S3?                          |
| API end-to-end      | Jest + Supertest         | Does the assembled application behave correctly over HTTP?                          |
| Contract            | Jest + Ajv               | Does every response match the published `openapi.json`?                             |
| Component (jsdom)   | Vitest + Testing Library | Does this component render and respond correctly?                                   |
| Component (browser) | Storybook + Cypress      | Does it behave correctly with real layout, focus and CSS?                           |
| Browser end-to-end  | Playwright               | Does a whole user journey work?                                                     |

Integration tests use **real containers**, not fakes, because what is worth
testing is exactly what a fake would not reproduce: that the `vector` extension
exists, that an HNSW index can be created, that the `portuguese` text-search
configuration is present, that the AWS SDK's request signing is accepted. An
in-memory substitute would pass while production failed.

### Why both Cypress and Playwright

They are used for different things, and the boundary is a rule, not a
preference:

- **Cypress Component Testing** mounts one component in a real browser. It
  covers what jsdom cannot model: real layout, real focus, real CSS, real
  scrolling. No whole journeys.
- **Playwright** drives complete journeys across routing, locales, streaming and
  uploads. No isolated components.

Keeping both costs a dependency and some CI time. It buys fast feedback on a
component without booting the application, and honest journey coverage without
mounting components in a journey tool.

Storybook's stories double as the browser component suite through
`@storybook/addon-vitest`: each story's `play` function runs as a Vitest test in
Chromium, with an accessibility check on every story. A documented state is
therefore also a tested one, which is the only way a story catalogue stays
honest.

### Contract tests with Ajv, not jest-openapi

`jest-openapi` is the obvious choice and has not been published since 2022.
Responses are validated with **Ajv** against the committed spec instead: it is
actively maintained, and it is what generated clients validate with anyway.

Whether the committed spec is current is checked in **CI**, by re-running
`pnpm openapi:export` and diffing, rather than in a test. The exported spec is
produced by `nest build`, whose Swagger plugin reads TSDoc into the
`description` fields; an in-process build compiled by SWC has no such plugin, so
the two differ by design and a test comparing them would be comparing unlike
things. The contract test asserts the comparable part: that every live route
appears in the spec.

### Deterministic models, with no `if (test)` in business code

`LLM_PROVIDER=mock` wires the AI SDK's mock models through the **same provider
factory** production uses. No branch in business code ever asks whether it is
running under test, because such a branch means the tested path is not the
shipped one.

Embeddings have two mocks for two different jobs:

- A **hash-based** model turns text into a stable unit vector. Enough to test
  batching, storage and caching; deliberately not semantic, so two paraphrases
  hash to unrelated vectors.
- **Recorded real embeddings** of a small fixture corpus, produced once and
  committed, for tests about retrieval _quality_, where semantics are the thing
  under test.

Conflating the two would produce retrieval tests that pass without meaning
anything.

## Alternatives considered

**Vitest everywhere, including Nest.** One runner, one config style, no
`--experimental-vm-modules`. It means fighting decorator metadata through an
extra SWC plugin and leaving the path every Nest example and answer assumes.
Rejected, but it is close, and Nest's own ESM starter uses Vitest — if the
backend moves to ESM, this should be revisited.

**Jest everywhere, including the web app.** Consistent, and slower for the front
end, with its own ESM friction in a Vite-based app. Rejected.

**Skip integration tests; mock the database.** Fastest suite, and it cannot
answer any of the questions that actually matter about pgvector or `tsvector`.
Rejected.

**One Playwright suite, no component tests.** Simplest to explain. A failure
then says "the page is wrong" rather than "this component mishandles an empty
list", and the suite is slow enough to discourage running it. Rejected.

## Consequences

- A developer runs `pnpm test` constantly and `pnpm test:all` before pushing.
- CI needs **no API keys**, because every model call goes through a mock.
- Container-backed suites need Docker, and they are slower. They run as their
  own CI stage so a lint or unit failure reports in under a minute.
- Two browser tools means two sets of knowledge. The rule above keeps the line
  clear enough that a new test has an obvious home.
