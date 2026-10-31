# 0005. Structure-aware chunking with overlap

- **Status:** accepted
- **Date:** 2026-10-30

## Context

A document is too long to embed as one vector and too long to put in a prompt.
It has to be split. How it is split decides more about answer quality than
almost anything downstream, and the damage is quiet: bad chunks do not throw,
they just retrieve slightly wrong passages forever.

Two failure modes matter. A chunk that straddles two unrelated sections
retrieves for both questions and answers neither well, because its embedding is
an average of two topics. And a chunk cut through the middle of a code example
produces a citation that is useless to read.

## Decision

Split along the strongest structural boundary available, falling back to weaker
ones only when a piece is still too large:

1. **Headings.** A heading starts a new chunk, so a section boundary is always a
   chunk boundary.
2. **Paragraphs.** Blank-line separated blocks accumulate until the ceiling.
3. **Sentences.** For a paragraph that is still too large on its own.
4. **Whitespace.** For a single sentence longer than a whole chunk.

Target **500 tokens** with **75 tokens of overlap** between consecutive chunks.
Sizes are in tokens, not characters, because that is the unit models charge and
limit by, and characters are a poor proxy: the same 43 characters can be 6
tokens or 9.

Two deliberate exceptions:

**A fenced code block is kept whole when it fits**, even if that pushes the
chunk past the ceiling. Half a code sample is worse than a slightly oversized
chunk. A block too large to keep whole is split at line boundaries, never
mid-line.

**Overlap is cut at line boundaries inside code and at sentence boundaries in
prose.** Cutting code as prose produced fragments like `compute(5);` taken from
the middle of a statement — worse than no overlap at all. Where even one unit
does not fit the budget, code takes no overlap rather than a fragment.

The overlap also gives way when carrying it would push a chunk past the ceiling:
the content is what matters, the overlap is a convenience.

## Why overlap at all

Without it, a sentence that answers a question is lost whenever it happens to
land on a boundary — the question matches neither the chunk that ends just
before it nor the one that starts just after. Overlap costs storage and a little
embedding spend, and buys insurance against an arbitrary cut landing in the
worst possible place.

## The heading travels with the chunk

A chunk's own text often never names the section it belongs to. The passage
under "Authentication" begins _"Call POST /auth/token…"_ and contains the word
"authentication" nowhere. Searching for it returned nothing, and its embedding
sat far from "how do I authenticate?".

So the heading path is prefixed to the text that gets **embedded**, and is
indexed alongside the content in the **tsvector**. The citation still shows the
passage alone, because the path is already in the citation's own metadata.

This was found by querying the database after the first real ingestion, not by a
test, which is why there is now a test for it at both levels.

## Alternatives considered

**Fixed-size windows with no structure.** Three lines of code and the usual
starting point. It cuts through headings, tables and code indifferently, and
every one of those cuts is a passage that retrieves badly. Rejected.

**One chunk per section, whatever the size.** Respects structure perfectly and
produces chunks of wildly uneven size; a 4,000-token section embeds to a vague
average of everything in it and blows the context budget when retrieved.
Rejected.

**Semantic chunking**, splitting where consecutive sentences' embeddings
diverge. Genuinely interesting and sometimes better. It costs an embedding call
per document before chunking even starts, is harder to explain, and is
non-deterministic enough to make downstream tests flaky. Rejected as a default;
it is a good eval experiment once there is a golden set to measure against.

**Chunk summarisation**, storing a generated summary beside each chunk and
embedding that. Helps on some corpora, adds a model call per chunk and a new way
to be wrong. Future work.

## Consequences

- Chunks line up with how a document is actually organised, so a retrieved
  passage reads like something a person wrote rather than a window that happened
  to land there.
- Chunking is pure logic over strings with no I/O, so every acceptance criterion
  in `docs/specs/chunking.md` is a unit test.
- 500 and 75 are starting values from common practice, **not measured**. They
  are a documented guess until M7 compares them against alternatives on a golden
  set.
- PDF headings are not detected. A PDF signals headings by font size, which the
  parser does not read, so PDF chunks carry page numbers instead of heading
  paths. Stated as a limitation rather than faked.
