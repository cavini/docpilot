# Test fixtures

## `embeddings.json` — not committed yet

Real embeddings of a subset of the demo corpus, used by the
retrieval-**quality** tests.

The deterministic mock embedder hashes text, so two paraphrases get unrelated
vectors. That is exactly right for testing batching, storage and caching, and
useless for testing whether retrieval actually finds the right passage — which
is the one thing the product is for.

So those tests run against vectors recorded once from a real provider and
committed, which keeps them meaningful, offline, free and deterministic.

### Producing it

```bash
# needs OPENAI_API_KEY in .env, and credit on the account
pnpm --filter @docpilot/api record-embeddings
```

It embeds about 1,600 tokens — roughly **$0.00003** at the
`text-embedding-3-small` rate.

Re-run it only when the fixture corpus or the chunker changes, since both change
the text being embedded. The output is committed precisely so that nobody needs
a key to run the tests.

### Until it exists

The retrieval-quality tests skip, with a message saying why. Every other test
level runs unchanged: the mock covers batching, storage, caching, ranking
fusion, citation handling and the API surface. What is missing is only the
assertion that a paraphrased question reaches the passage that answers it.
