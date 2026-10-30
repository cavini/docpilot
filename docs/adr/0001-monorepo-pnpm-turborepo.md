# 0001. Monorepo with pnpm workspaces and Turborepo

- **Status:** accepted
- **Date:** 2026-10-30

## Context

DocPilot is one product made of several deployable pieces: a NestJS HTTP API, a
NestJS ingestion worker, a NestJS MCP server, a Next.js web app, and later an
Expo mobile app. They share real code, not just conventions:

- The Zod schemas and TypeScript types that describe the API contract, citation
  shapes and tool inputs.
- A design-system component library.
- Test factories and the deterministic mock language model used by every test
  level.

If those pieces lived in separate repositories, a change to a shared contract
would need a publish, a version bump and a coordinated merge in three places
before anyone could see whether it compiled. For a project maintained by one
person, that cost buys nothing.

I also want every workspace to be checked the same way, with one ESLint
configuration, one Prettier configuration and one set of strict compiler
options, so that "it passes lint" means the same thing everywhere.

## Decision

Use a single repository with **pnpm workspaces** for dependency resolution and
linking, and **Turborepo** for task orchestration and caching.

- `pnpm-workspace.yaml` declares `apps/*`, `packages/*` and `evals` as
  workspaces. Internal dependencies use the `workspace:*` protocol, so they
  always resolve to the local copy and never to a published version.
- `turbo.json` declares the task graph. `build`, `lint`, `typecheck` and `test`
  each declare `dependsOn: ["^build"]`, so a workspace is never checked against
  a stale build of a package it depends on.
- The Node version is pinned in `.nvmrc` and enforced through `engines`, and the
  pnpm version is pinned through `packageManager`, so a clean clone resolves the
  same toolchain.

## Alternatives considered

**Separate repositories per app.** Honest isolation and independent release
cadence, at the cost of publishing a package every time a shared type changes.
The API contract between the API, the web app and the MCP server changes often
in a project like this, so the overhead would dominate. Rejected.

**npm or Yarn workspaces.** Both work. pnpm's content-addressed store makes
installs noticeably faster and its strict `node_modules` layout refuses to
resolve a dependency a workspace did not declare, which catches a class of bug
that a flat `node_modules` hides. That strictness is the main reason for the
choice; it caught a missing `typescript-eslint` declaration in this repository
on the first run.

**Nx instead of Turborepo.** Nx has a richer plugin and generator story and
better support for enforcing module boundaries. It also owns more of the build:
executors wrap the underlying tools, so understanding a failure means
understanding Nx as well as the tool. Turborepo only runs the `package.json`
scripts I already wrote and caches their output, which keeps each tool's own
behaviour visible. For a repository I need to be able to explain line by line,
that transparency matters more than the extra features.

**No task runner, just pnpm recursive scripts.** `pnpm -r run build` works and
needs no extra dependency, but it has no caching and no dependency-aware
ordering beyond the topological default. Turborepo's cache turns a no-op CI run
from minutes into seconds, which is worth one dependency.

## Consequences

- One `pnpm install` sets up everything; one `pnpm lint` checks everything.
- A shared contract change and the code that consumes it land in the same
  commit, so the compiler catches a mismatch immediately.
- The repository will hold a large amount of code, and CI must be careful to run
  only what a change affects. Turborepo's cache and filtering handle this, but
  the CI workflow has to be written to use them.
- Turborepo caches locally by default. A remote cache would help a team; for a
  single maintainer it adds an account and a secret for little gain, so it stays
  off.
