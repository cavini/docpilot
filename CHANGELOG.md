# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- pnpm workspace with Turborepo, shared strict TypeScript configuration, one
  ESLint flat config for the whole repository, Prettier, and a lint-staged
  pre-commit hook.
- Docker Compose with PostgreSQL 17 plus pgvector, Redis configured for the job
  queue, and S3 emulation. `pnpm infra:up` waits until every service is
  genuinely usable, including the document bucket.
- `packages/shared`: the health contract and the dependency status rollup.
- NestJS API: environment validated with Zod before startup, structured logging
  with request ids, typed domain errors behind a global exception filter,
  Postgres with pgvector, Redis, document storage, health endpoints, feature
  flags, Swagger at `/docs` with a committed OpenAPI spec, and a worker
  entrypoint.
- First migration, enabling the `vector` extension.
- Next.js web application: Tailwind, English and Brazilian Portuguese, a Redux
  Toolkit store with a typed API client, and a landing page reporting the API's
  health.
- `packages/ui`: design tokens, a `Button`, and Storybook with interaction tests
  that run in Chromium and check accessibility on every story.
- `packages/testing`: seeded factories and a deterministic embedding model, so
  the suite needs no API key.
- Every test level: unit, integration against real containers, API end-to-end,
  contract against the OpenAPI spec, component in a browser, and browser
  journeys with an accessibility check.
- GitHub Actions workflow running all of it, with no secrets.

### Fixed

- Redis reported as down on every fresh process: with the offline queue
  disabled, a lazily created client could not issue its first command.
- The web application showed "API unreachable" when the API answered 503,
  discarding the body that said which dependency had failed.
- The generated OpenAPI spec was reformatted by the pre-commit hook, so the
  regenerate-and-diff check in CI could never pass.
- Coverage measured with V8 rather than Babel instrumentation, which had been
  counting unreachable branches emitted for decorators.
