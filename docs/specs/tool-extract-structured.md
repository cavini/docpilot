# Spec: `extract_structured`

Status: accepted Milestone: M4

## Problem and goal

"List every endpoint as JSON" is a question prose cannot answer. A model asked
for JSON in an answer produces something that usually parses and occasionally
does not — and the caller finds out at `JSON.parse`.

The goal is extraction constrained by a schema, so what comes back either
matches or fails loudly.

## Behaviour

**A registry, not a free-form schema.** The tool takes the _name_ of a schema
the server knows, not a schema the model invents. A model-supplied schema is a
model-supplied contract: nothing downstream could rely on it, and it would be a
way to make the server run arbitrary shapes.

M4 ships one: `api_endpoints`. M5 adds the rest and the endpoint that exposes
the registry directly.

**Constrained generation.** The AI SDK's structured output, not "please reply
with JSON". The schema is enforced by the provider where it can be and validated
here regardless.

**Retrieval first.** The passages relevant to the schema are retrieved, then
extraction runs over them. Extracting from the whole corpus would be a
summarisation problem wearing a different hat.

## Input

```ts
{
  schema: 'api_endpoints';    // a name from the registry
  documentId?: string;        // restrict to one document
  query?: string;             // what to look for; defaults per schema
}
```

## Output

```ts
{
  schema: string;
  items: unknown[];           // validated against the named schema
  citations: Array<{ n: number; chunkId: string }>;
}
```

### The `api_endpoints` schema

```ts
{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // '/auth/token'
  summary: string;
  authenticated: boolean;
}
```

## Acceptance criteria

**AC1.** Given a corpus describing endpoints, when extraction runs, then the
items validate against the named schema.

**AC2.** Given a schema name not in the registry, when the tool runs, then it
returns a structured error listing the names that are.

**AC3.** Given the model returns something that does not match, when it is
validated, then the tool returns an error rather than passing it on.

**AC4.** Given nothing in the corpus matches, when extraction runs, then an
empty list is returned rather than invented items.

**AC5.** Given `documentId`, when extraction runs, then only that document is
read.

**AC6.** Given extracted items, when they are returned, then they carry
citations back to the passages they came from.

**AC7.** Given a call, when it completes, then its tokens and cost are recorded.

## Edge cases and failure modes

| Situation                          | Behaviour                                                 |
| ---------------------------------- | --------------------------------------------------------- |
| Provider cannot enforce the schema | Validated here; a mismatch is an error, not a best effort |
| Duplicate items across passages    | Deduplicated on method and path                           |
| A method the schema does not know  | That item is dropped, and the drop is reported            |

## Non-goals

- Model-supplied schemas, for the reason above.
- More than one schema per call.
- Writing the result anywhere. The tool returns it; what happens next is the
  reader's.

## Test plan

| AC           | Level       | File                                                       |
| ------------ | ----------- | ---------------------------------------------------------- |
| AC2, AC3     | unit        | `apps/api/src/agent/tools/extract-structured.tool.spec.ts` |
| AC1, AC4–AC7 | integration | `apps/api/test/integration/agent.spec.ts`                  |
