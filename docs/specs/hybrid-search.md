# Spec: Hybrid search

Status: accepted Milestone: M2

## Problem and goal

Neither way of searching is sufficient on its own.

**Embeddings** find meaning. "How do I authenticate?" reaches a passage that
says _"exchange your client credentials for a bearer token"_ with no word in
common. They are also vague about exact strings: an error code, a function name
or a header is blurred into the surrounding meaning, so searching
`X-RateLimit-Reset` can return a passage about rate limits generally while
missing the one that names the header.

**Keyword search** is the mirror image. It finds `X-RateLimit-Reset` exactly and
fails completely on a paraphrase.

The goal is one ranked list that is good at both, without one method's
confident-but-wrong result crowding out the other's correct one.

## Behaviour

A query runs both searches, then **fuses** the two ranked lists. A passage that
both methods rank highly comes first; a passage only one method found can still
rank well if it ranked very highly there.

Fusion uses **Reciprocal Rank Fusion**: each result scores `1 / (k + rank)`
summed across the lists it appears in, with `k = 60`.

RRF uses only each result's **position**, never its score. That is the point: a
cosine distance and a `ts_rank_cd` value are not comparable — different units,
different distributions, different scales — and any attempt to normalise them
into one number is a fudge factor that needs retuning whenever either side
changes. Ranks are comparable by construction.

### A worked example

Searching for "how do I authenticate?" over five chunks:

| Chunk                                                | Vector rank | Keyword rank | RRF score              | Final |
| ---------------------------------------------------- | ----------- | ------------ | ---------------------- | ----- |
| A — "exchange client credentials for a bearer token" | 1           | 3            | `1/61 + 1/63 = 0.0323` | **1** |
| B — "Authentication" section intro                   | 3           | 1            | `1/63 + 1/61 = 0.0323` | **2** |
| C — "rotating a secret"                              | 2           | —            | `1/62 = 0.0161`        | 3     |
| D — "token expiry"                                   | —           | 2            | `1/62 = 0.0161`        | 4     |
| E — "rate limiting"                                  | 5           | —            | `1/65 = 0.0154`        | 5     |

A and B each appear in both lists and win. C and D appear in one list each and
land below them despite ranking second in their own. E, ranked fifth by one
method and absent from the other, ends last.

### Why k = 60

`k` damps the influence of top ranks. With a small `k`, rank 1 dominates
everything; with a large one, all ranks flatten toward equal. 60 is the value
from the original RRF paper and the common default. It is a starting value here,
not a measured one, and M7's evals are where it gets tested.

## API contract

### `POST /search`

```json
{ "query": "how do I authenticate?", "topK": 8, "documentIds": ["..."] }
```

**200**

```json
{
  "results": [
    {
      "chunkId": "...",
      "documentId": "...",
      "documentTitle": "lumen-api",
      "content": "Call POST /auth/token with your client id and client secret…",
      "headingPath": "Lumen API > Authentication",
      "pageStart": null,
      "pageEnd": null,
      "score": 0.0323,
      "vectorRank": 1,
      "keywordRank": 3
    }
  ],
  "tookMs": 41
}
```

`vectorRank` and `keywordRank` are returned so the fusion can be inspected
rather than taken on trust. They are what makes a bad result debuggable.

## Acceptance criteria

**AC1.** Given a question phrased differently from the text that answers it,
when it is searched, then the answering chunk is in the results — which keyword
search alone would miss.

**AC2.** Given a query that is an exact identifier such as a header name, when
it is searched, then the chunk containing that identifier ranks first — which
vector search alone ranks lower.

**AC3.** Given a chunk ranked highly by both methods and one ranked highly by
only one, when they are fused, then the chunk found by both ranks higher.

**AC4.** Given two ranked lists, when they are fused, then each result's score
is the sum of `1 / (60 + rank)` over the lists it appears in.

**AC5.** Given a result present in only one list, when fusion runs, then it is
still included rather than discarded.

**AC6.** Given the same inputs, when fusion runs twice, then the output order is
identical, including how ties are broken.

**AC7.** Given `topK`, when a search runs, then at most that many results are
returned.

**AC8.** Given `documentIds`, when a search runs, then results come only from
those documents.

**AC9.** Given a query matching nothing, when it is searched, then an empty list
is returned rather than an error.

**AC10.** Given a Portuguese query over a Portuguese document, when it is
searched, then keyword search matches stemmed forms — `autenticar` finds
`autenticação`.

**AC11.** Given a query, when it is embedded, then the embedding is cached, so
the same query searched twice embeds once.

**AC12.** Given a document is ingested, when the cache is consulted afterwards,
then stale results are not returned.

**AC13.** Given an empty or whitespace-only query, when it is searched, then the
request is rejected rather than embedding nothing.

**AC14.** Given a query longer than the configured limit, when it is searched,
then it is rejected rather than sent to the provider.

## Edge cases and failure modes

- **An empty corpus.** Both searches return nothing; fusion returns nothing.
- **The embedding provider is down.** The whole search fails rather than
  silently degrading to keyword-only, because a caller shown half a search with
  no indication is worse off than one shown an error.
- **A query of only stop words.** `websearch_to_tsquery` produces an empty query
  that matches nothing; the vector side still returns neighbours.
- **A tie in the fused score.** Broken by chunk id, so the order is stable.

## Non-goals

- Reranking with a second model. Flagged behind `FF_RERANK`, built later, and
  measured in M7 rather than assumed to help.
- Query rewriting or expansion.
- Per-document relevance tuning or boosting.

## Test plan

| AC                 | Level          | File                                                          |
| ------------------ | -------------- | ------------------------------------------------------------- |
| AC3–AC6            | unit           | `apps/api/src/retrieval/fusion.spec.ts`                       |
| AC1, AC2, AC8–AC10 | integration    | `apps/api/test/integration/retrieval.spec.ts`                 |
| AC7, AC13, AC14    | unit + API e2e | `apps/api/src/retrieval/*.spec.ts`, `test/e2e/search.spec.ts` |
| AC11, AC12         | integration    | `apps/api/test/integration/retrieval.spec.ts`                 |

AC1 and AC2 need embeddings that mean something, so they run against **recorded
real embeddings** of the fixture corpus rather than the hash-based mock. See
`docs/testing.md`.

## Open questions

Whether to weight the two lists unequally — RRF allows a per-list weight.
Unweighted until the evals in M7 say otherwise, because guessing a weight is
exactly the fudge factor RRF exists to avoid.
