# Spec: `summarize_document`

Status: accepted Milestone: M4

## Problem and goal

"Summarise the billing guide" is a question retrieval cannot answer. Hybrid
search returns the eight passages most like the question; a summary needs the
whole document.

## Behaviour

**Map-reduce.** Each chunk is summarised, then the summaries are summarised. A
long document does not fit in one prompt, and truncating it to fit produces a
summary of the first third that claims to be a summary of the document.

**Citations survive.** Each map step keeps the chunk numbers it covered, so the
final summary can point at the passages behind each claim rather than being an
unattributable paraphrase.

**Bounded.** A document above `SUMMARY_MAX_CHUNKS` is refused rather than
silently costing a hundred model calls. The refusal says how large it is, so the
reader can narrow the request.

**Short documents skip the reduce step.** One model call where one will do.

## Input

```ts
{
  documentId: string;         // uuid
  focus?: string;             // "just the authentication parts"
}
```

## Output

```ts
{
  summary: string;
  documentTitle: string;
  chunksCovered: number;
  citations: Array<{ n: number; chunkId: string; headingPath: string | null }>;
}
```

## Acceptance criteria

**AC1.** Given a document, when it is summarised, then every chunk is covered.

**AC2.** Given a document with more chunks than fit one prompt, when it is
summarised, then the map and reduce steps both run.

**AC3.** Given a document small enough for one prompt, when it is summarised,
then the reduce step is skipped.

**AC4.** Given a summary, when it is returned, then it carries citations back to
the chunks behind it.

**AC5.** Given a `focus`, when the document is summarised, then the focus is in
every map prompt — not only in the reduce, where the detail has already been
discarded.

**AC6.** Given a document id that does not exist, when the tool runs, then it
returns a structured error naming it.

**AC7.** Given a document that is not `ready`, when the tool runs, then it
refuses rather than summarising a partial corpus.

**AC8.** Given a document above the chunk limit, when the tool runs, then it
refuses and says how large the document is.

**AC9.** Given the map steps, when they run, then each call is recorded in the
usage ledger.

## Edge cases and failure modes

| Situation                      | Behaviour                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| One map step fails             | The error is returned; a summary missing a section without saying so is worse than no summary |
| A chunk is enormous            | Already bounded by the chunker's ceiling                                                      |
| Document has exactly one chunk | Summarised directly, no reduce                                                                |

## Non-goals

- Caching a summary. The document can change, and the cost of being wrong is
  higher than the cost of recomputing.
- Summarising more than one document in a call.
- Controlling the summary's length beyond the `focus`.

## Test plan

| AC                 | Level                   | File                                                       |
| ------------------ | ----------------------- | ---------------------------------------------------------- |
| AC2, AC3, AC5      | unit with scripted mock | `apps/api/src/agent/tools/summarize-document.tool.spec.ts` |
| AC6, AC8           | unit                    | `apps/api/src/agent/tools/summarize-document.tool.spec.ts` |
| AC1, AC4, AC7, AC9 | integration             | `apps/api/test/integration/agent.spec.ts`                  |
