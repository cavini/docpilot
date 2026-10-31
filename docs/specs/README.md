# Specs

One file per feature, written **before** the code and committed on its own.

A spec is not design documentation written afterwards. It is the agreement about
what the feature does, made while it is still cheap to change, and it stays in
the repository as the record of intended behaviour. When behaviour changes, the
spec changes with it.

## Why the acceptance criteria are numbered

Every criterion is written as Given/When/Then and numbered `AC1`, `AC2`, and so
on. Each one then appears in the name of at least one test:

```ts
it('AC3: overlaps consecutive chunks by about 75 tokens', () => {
```

So `grep -r AC3` finds the test that proves it. A reviewer can read the spec and
confirm each line is actually enforced, rather than inferring it from a coverage
percentage.

**Contract tests are the exception** and carry no numbers. What they assert is a
property of the published OpenAPI document — every route documented, every
documented route reachable, real responses valid against the schemas clients are
generated from. That cuts across features, and a local `AC3` in a contract file
would collide with a different `AC3` in a feature spec, breaking exactly the
lookup the numbering exists for.

## Status

- `draft` — being written or discussed; the code does not exist yet.
- `accepted` — agreed, implementation can start.
- `implemented` — every criterion is covered by a passing test, and the test
  plan below points at the real files.

## Template

```markdown
# Spec: <feature>

Status: draft | accepted | implemented Milestone: Mx

## Problem and goal

Two to four sentences in plain language. What cannot be done today, and what
should be possible afterwards.

## Behaviour

What the user or the calling client observes. No implementation detail.

## API contract

Endpoints, events, GraphQL operations or tool schemas, with request and response
examples and the errors each can return.

## Acceptance criteria

AC1. Given <context>, when <action>, then <observable outcome>. AC2. ...

## Edge cases and failure modes

What happens with empty input, enormous input, a slow dependency, a failing
dependency, a malformed response.

## Non-goals

What this feature deliberately does not do, so the scope cannot creep silently.

## Test plan

| AC  | Level | File                      |
| --- | ----- | ------------------------- |
| AC1 | unit  | `apps/api/src/...spec.ts` |

## Open questions

Anything that changes the product's behaviour and needs a decision.
```
