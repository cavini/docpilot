# Spec: `search_docs`

Status: accepted Milestone: M4

## Problem and goal

The agent needs to look things up. `/chat` retrieves once, with the question as
the query; an agent should be able to search again with better terms after
reading what the first search returned.

## Behaviour

Runs the same hybrid search as `POST /search`: vector and keyword, fused by
reciprocal rank. Returns the passages with the metadata a citation needs, so the
model can cite what it used.

The query is the model's, not the reader's. That is the point — "how do I
authenticate" might become "bearer token expiry" on a second pass.

## Input

```ts
{
  query: string;              // non-empty
  topK?: number;              // 1–20, default from RETRIEVAL_TOP_K
  documentIds?: string[];     // restrict the search
}
```

## Output

```ts
{
  results: Array<{
    n: number; // the citation number
    chunkId: string;
    documentId: string;
    documentTitle: string;
    headingPath: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    content: string;
  }>;
}
```

Numbered from 1 so the model can cite `[n]` directly, matching what `/chat`
already does.

## Acceptance criteria

**AC1.** Given a query, when the tool runs, then it returns ranked passages.

**AC2.** Given a query matching nothing, when the tool runs, then it returns an
empty list rather than an error — "nothing found" is information the model can
act on.

**AC3.** Given `topK`, when the tool runs, then at most that many results come
back.

**AC4.** Given `documentIds`, when the tool runs, then results come only from
those documents.

**AC5.** Given an empty query, when the tool runs, then it returns a structured
validation error rather than searching for nothing.

**AC6.** Given results, when they are returned, then each carries the metadata a
citation needs.

## Edge cases and failure modes

| Situation                         | Behaviour                                               |
| --------------------------------- | ------------------------------------------------------- |
| `topK` above the maximum          | Rejected by the schema; the model is told the bound     |
| The embedding provider is down    | Structured error; the model can say it could not search |
| A document id that does not exist | Treated as a filter that matches nothing                |

## Non-goals

Reranking, query expansion, or any retrieval behaviour `/search` does not
already have. This tool is a handle on the existing pipeline, not a second one.

## Test plan

| AC                 | Level       | File                                                |
| ------------------ | ----------- | --------------------------------------------------- |
| AC3, AC5           | unit        | `apps/api/src/agent/tools/search-docs.tool.spec.ts` |
| AC1, AC2, AC4, AC6 | integration | `apps/api/test/integration/agent.spec.ts`           |
