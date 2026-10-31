# 0006. Hybrid search with Reciprocal Rank Fusion

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Neither way of searching is sufficient on its own, and their failures are mirror
images.

**Embeddings** find meaning. "How do I prove who I am?" reaches a passage that
says _"exchange your client credentials for a bearer token"_ with not one word
in common. They are vague about exact strings: an error code, a header name or a
function signature gets blurred into the surrounding meaning.

**Keyword search** finds `X-RateLimit-Reset` exactly, and returns **nothing**
for the paraphrase. Both halves of that were confirmed against the real corpus
before this was decided, not assumed.

So both are needed. The question is how to combine two ranked lists whose scores
mean entirely different things.

## Decision

Run both searches concurrently and fuse their ranked lists with **Reciprocal
Rank Fusion**: each result scores `1 / (k + rank)` in every list it appears in,
summed, with `k = 60`.

**Only positions are used, never scores.** A cosine distance lives in roughly
`[0, 2]` with a distribution that depends on the embedding model; a `ts_rank_cd`
value is unbounded and depends on term frequencies in the corpus. Combining them
into one number means normalising two incomparable distributions, which needs a
weighting constant that has to be re-tuned whenever the embedding model, the
corpus or the stemmer changes — and which nobody will remember to re-tune. Ranks
are comparable by construction.

Ties break by chunk id, so results are stable. An unstable order makes every
downstream test flaky and makes a result impossible to reproduce from a bug
report.

### The candidate pool is larger than the output

Each method contributes 50 candidates before fusion, for a result set of
typically 8. Fusion can only promote what it was given: a passage that keyword
search ranks 15th and vector search ranks 2nd has to survive both candidate
lists to be fused at all. Too small a pool silently turns hybrid search back
into whichever method happened to rank a result first — the kind of degradation
that produces no error and shows up only as mediocre answers.

This is visible in practice. Searching the corpus for `X-RateLimit-Reset`
returns, in second place, a chunk that vector search ranked **15th** and keyword
search ranked 2nd. With a pool of 10 it would have been invisible.

### Why k = 60

`k` damps how steeply influence falls with rank. Small, and rank 1 dominates
everything; large, and every rank flattens toward equal. 60 comes from the
original RRF paper and is the common default.

It is a **starting value, not a measured one**, and so is the choice to weight
the two lists equally. Both are exactly what M7's evals exist to test. Guessing
a weight now would be the fudge factor RRF was chosen to avoid.

## Alternatives considered

**Normalise both scores to [0, 1] and take a weighted sum.** The obvious
approach, and it works until something changes. Min-max normalisation over a
result set means a score depends on the other results returned, so the same
chunk scores differently for different queries. The weight is a magic number
with no principled value. Rejected.

**Vector search only.** Simplest, and one system instead of two. It fails
exactly where documentation search most needs to succeed: looking up an exact
identifier. Rejected, and demonstrated rather than assumed.

**Keyword search only.** Cheap, no embedding bill, no vector index. It returns
nothing for a paraphrase, which is the main thing a question-answering product
is asked to do. Rejected.

**Postgres' own hybrid ranking in one query**, combining `ts_rank_cd` and vector
distance in a single `ORDER BY`. One round trip instead of two. It requires
inventing the relative weighting this decision exists to avoid, and makes the
two halves impossible to inspect separately. Rejected — though the single round
trip is a real advantage worth revisiting if latency ever matters more than
explicability.

**Cross-encoder reranking instead of fusion.** Genuinely more accurate, and a
model call per result set. It is complementary rather than an alternative:
rerank the fused list, not the raw ones. Behind `FF_RERANK` and measured in M7.

## Consequences

- A query is good at both paraphrases and exact identifiers, which is what a
  documentation corpus actually gets asked.
- There is no weighting constant to tune, and no normalisation to go stale when
  the embedding model changes.
- Every result reports its rank in each method, so a bad result is diagnosable:
  it shows immediately whether retrieval failed or the model ignored what it was
  given.
- Two queries instead of one. They run concurrently, so the cost is the slower
  of the two rather than the sum.
- Fusion scores are comparable **within** one search only. They are a sum of
  reciprocal ranks, not a probability, and showing one to a user as a confidence
  percentage would be a lie.
