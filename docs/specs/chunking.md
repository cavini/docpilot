# Spec: Chunking

Status: implemented Milestone: M1

## Problem and goal

A document is too big to embed as one vector and too big to put in a prompt. It
has to be cut into pieces. How it is cut decides almost everything about answer
quality later: a chunk that straddles two unrelated sections retrieves for both
and answers well for neither, and a chunk that splits a code example in half
produces citations that are useless to read.

The goal is pieces that are **individually meaningful**, small enough to
retrieve precisely, and carrying enough location information that a citation can
point a reader at the exact passage.

## Behaviour

Text is split along the strongest structural boundary available, falling back to
weaker ones only when a piece is still too large:

1. **Headings** — a section under a heading stays together when it fits.
2. **Paragraphs** — blank-line separated blocks.
3. **Sentences** — for a paragraph that is still too large.
4. **Hard split** — for a single sentence longer than the limit.

Consecutive chunks **overlap** by roughly `CHUNK_OVERLAP_TOKENS`, so a sentence
that answers a question is not lost because it happened to land on a boundary.

A fenced code block is kept whole when it fits in a chunk, even if that makes
the chunk larger than the target, because half a code sample is worse than a
slightly oversized chunk.

Every chunk records where it came from: its ordinal, the heading path above it,
the page range it covers, and its character offsets in the source.

## Acceptance criteria

**AC1.** Given text that fits in one chunk, when it is chunked, then exactly one
chunk is produced containing all of it.

**AC2.** Given text longer than `CHUNK_SIZE_TOKENS`, when it is chunked, then no
chunk exceeds `CHUNK_SIZE_TOKENS`, except where AC7 applies.

**AC3.** Given a document of several paragraphs, when it is chunked with
`CHUNK_OVERLAP_TOKENS = 75`, then consecutive chunks share between 50 and 100
tokens of text.

**AC4.** Given Markdown with nested headings, when it is chunked, then each
chunk's `headingPath` is the chain of headings above it, joined by `" > "`.

**AC5.** Given a document with two sections that both fit, when it is chunked,
then the section boundary is a chunk boundary: no chunk contains text from both.

**AC6.** Given a fenced code block that fits within `CHUNK_SIZE_TOKENS`, when it
is chunked, then the block appears whole in exactly one chunk, with its fences
intact.

**AC7.** Given a fenced code block larger than `CHUNK_SIZE_TOKENS`, when it is
chunked, then it is split at line boundaries, never mid-line.

**AC8.** Given a single paragraph far longer than the limit, when it is chunked,
then it is split at sentence boundaries where possible.

**AC9.** Given a single sentence longer than the limit, when it is chunked, then
it is hard-split, and no chunk is empty.

**AC10.** Given empty or whitespace-only input, when it is chunked, then no
chunks are produced.

**AC11.** Given Portuguese text with accents and cedillas, when it is chunked,
then no character is corrupted and token counts match the tokenizer's.

**AC12.** Given the same input twice, when it is chunked, then the output is
identical, because a non-deterministic chunker makes every downstream test
flaky.

**AC13.** Given a chunk, when it is produced, then `charStart` and `charEnd`
index the original text such that slicing it returns the chunk's own content.

**AC14.** Given a chunked document, when the chunks are read in order, then
their `ordinal` values are 0, 1, 2, … with no gaps.

**AC15.** Given per-page text from a PDF, when it is chunked, then each chunk
records the first and last page it covers, so a citation can name a page.

**AC16.** Given a chunk that fits entirely on one page, when it is produced,
then `pageStart` equals `pageEnd`.

**AC17.** Given text containing Windows line endings, when it is chunked, then
they are normalised and do not affect the boundaries chosen.

## Edge cases and failure modes

- **A heading with no body.** Produces no chunk of its own; it becomes part of
  the following section's heading path.
- **A document that is one enormous table.** Rows are lines, so it splits at
  line boundaries. Table semantics are lost; noted as a known limitation.
- **Overlap larger than the chunk size.** A configuration mistake; rejected at
  startup by the environment schema rather than producing infinite chunks.
- **Text with no sentence punctuation at all** (common in Chinese, and in
  minified content). Falls through to the hard split.

## Non-goals

- Semantic or embedding-based chunking. It costs a model call per document and
  is harder to explain; structure-aware splitting is the better default and the
  comparison belongs in evals.
- Table-aware or layout-aware extraction.
- Summarising a chunk to enrich it. That is a later experiment.

## Test plan

| AC                      | Level | File                                             |
| ----------------------- | ----- | ------------------------------------------------ |
| AC1–AC3, AC8–AC14, AC17 | unit  | `apps/api/src/ingestion/chunker/chunker.spec.ts` |
| AC4–AC7                 | unit  | `apps/api/src/ingestion/chunker/chunker.spec.ts` |
| AC15, AC16              | unit  | `apps/api/src/ingestion/chunker/chunker.spec.ts` |
| AC11                    | unit  | `apps/api/src/ingestion/chunker/chunker.spec.ts` |

Chunking is pure logic over strings, so every criterion is a unit test. That is
the point of keeping it free of I/O.

## Open questions

`CHUNK_SIZE_TOKENS = 500` and `CHUNK_OVERLAP_TOKENS = 75` are starting values
taken from common practice, not measured. M7's evals compare them against other
settings; until then they are a documented guess, not a conclusion.
