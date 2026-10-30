# Contributing

## Requirements

| Tool    | Version                           |
| ------- | --------------------------------- |
| Node.js | see [`.nvmrc`](./.nvmrc) (26 LTS) |
| pnpm    | 10.11 or later                    |
| Docker  | with Compose v2                   |

With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install   # reads .nvmrc
nvm use
```

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm infra:up      # Postgres with pgvector, Redis, LocalStack
pnpm db:migrate
pnpm seed
pnpm dev
```

## Checks

```bash
pnpm lint          # ESLint across every workspace
pnpm typecheck     # tsc --noEmit per workspace
pnpm format:check  # Prettier
pnpm test          # unit tests
pnpm test:all      # every test level, in CI order
```

A pre-commit hook runs ESLint and Prettier over staged files only. Run the full
set before opening a pull request.

`pnpm install` builds the shared packages and generates Next's route types
first, because both lint and typecheck need them. That is why a fresh clone can
run `pnpm lint` without building anything by hand.

## How a feature gets built

Every feature follows the same loop: **spec, failing test, implementation,
refactor, docs.**

1. **Write the spec first.** Add `docs/specs/<feature>.md` using the template in
   [`docs/specs/README.md`](./docs/specs/README.md) and commit it on its own.
   The spec states the problem, the observable behaviour, the API contract, and
   numbered acceptance criteria as Given/When/Then (`AC1`, `AC2`, ...).
2. **Write the contract next.** Zod schemas and types in `packages/shared`, and
   the Nest DTOs with their Swagger decorators, so the tests and the
   implementation compile against the same shapes.
3. **Red, green, refactor** for anything with logic in it. Name the test after
   the acceptance criterion it covers:

   ```ts
   it('AC3: overlaps consecutive chunks by about 75 tokens', () => {
   ```

   Because every acceptance criterion appears in a test name, `grep AC3` finds
   the test that proves it.

4. **Close the spec.** Set its status to `implemented`, point its test plan at
   the real test files, and update the affected documentation in the same commit
   or the next one.

Glue code (modules, controllers, layout) may be tested after the fact, but every
acceptance criterion must be covered before a milestone closes.

[`docs/testing.md`](./docs/testing.md) explains the test pyramid, which level
covers what, and how the deterministic mock language model works.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), with a short,
imperative, lowercase subject and no trailing period:

```
feat(api): add pdf parser
fix(web): handle empty stream
test(api): cover chunk overlap edge cases
refactor(api): extract chunker into its own module
docs: explain chunk overlap choice
build: configure turborepo pipelines
chore: add docker compose for postgres with pgvector
```

Scopes follow the workspace: `api`, `web`, `mcp`, `ui`, `shared`, `testing`,
`evals`. Omit the scope for repository-wide changes.

Keep commits small and focused on one logical change. Use the body to explain
_why_ when the reason is not obvious from the diff. Commit documentation
alongside the code it describes, or in the commit straight after.

Every bug fix starts with a failing regression test:

```
test(web): reproduce empty stream crash
fix(web): handle empty stream
```

## Branches

Work happens on short-lived branches named after the change (`feat/ingestion`,
`fix/empty-stream`, `docs/rag-pipeline`) and merges into `main` with a merge
commit, so the history shows which commits belonged to which piece of work.
`main` stays green.

## Conventions

**Layout.** One Nest module per feature folder, holding its controller, service,
DTOs and tests. Tests live next to the code they cover (`*.spec.ts` for Nest,
`*.test.ts(x)` elsewhere); tests that need containers live in
`apps/api/test/integration`.

**Naming.** `kebab-case` file names, `PascalCase` types and classes, `camelCase`
values. Nest providers end in their role: `ChunkerService`,
`DocumentsController`, `IngestionProcessor`.

**Backend.** All server-side logic is NestJS. Business logic lives in services,
never in a controller, gateway or resolver, and never in a Next.js route handler
or server action. See
[`docs/adr/0011-nestjs-only-backend.md`](./docs/adr/0011-nestjs-only-backend.md).

**Validation.** Every external input is validated: HTTP bodies through DTOs,
environment variables, WebSocket payloads, tool inputs and model output.

**Errors.** Throw typed domain errors. A global exception filter maps them to
`{ error: { code, message, requestId } }`. Never swallow an error.

**Types.** `strict` is on, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. `any` is a lint error; use `unknown` and narrow.
`@ts-ignore` is banned and `@ts-expect-error` needs a written reason.

**Logging.** Structured pino logs with a request ID. Never log secrets, whole
documents or whole prompts above `debug`.

**Documentation.** TSDoc on every exported function, class, method and type.
Comments explain why, not what. No commented-out code, and no bare `TODO`: use
`TODO(scope): reason`.
