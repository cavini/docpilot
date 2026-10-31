# Spec: Answers with citations

Status: implemented Milestone: M2

## Problem and goal

A model asked about documents it has not been given will answer anyway, from
whatever it absorbed in training. The answer is often right, sometimes
confidently wrong, and never checkable.

The goal is an answer **grounded** in retrieved passages, where every claim
carries a citation pointing at the passage it came from, and where the honest
response to "the documents do not say" is to say so.

## Behaviour

A question is searched. The best passages become numbered context in a prompt
that instructs the model to answer **only** from that context and to cite the
numbers it used. The answer comes back with markers like `[1]` and `[2]`, which
are mapped to the chunks they refer to and returned alongside it.

A marker the model invents — `[7]` when only three passages were supplied — is
**dropped from the answer text**, not silently rendered as a dead link.

When nothing retrieved is relevant, the model is instructed to say it does not
know rather than to fill the gap. A refusal is a correct answer.

## The prompt

Context blocks are numbered and labelled with their source, and the instruction
to cite is explicit:

```
You answer questions about a set of documents.

Use ONLY the numbered context below. If the context does not contain the
answer, say that you do not know based on the provided documents. Do not use
knowledge from outside the context.

Cite the context you used with markers like [1] or [2], placed immediately
after the claim they support. Cite only numbers that appear below.

Answer in the language of the question.

[1] lumen-api — Lumen API > Authentication
Call POST /auth/token with your client id and client secret…

[2] lumen-api — Lumen API > Rate limiting
Every endpoint allows 120 requests per minute…
```

Retrieved content is **delimited and labelled as data**. A document can contain
text that reads like an instruction, and the prompt's structure is the first
line of defence against it being followed. Full treatment is M7's concern; the
structure is set up here rather than retrofitted.

## API contract

### `POST /ask`

```json
{ "question": "How do I authenticate?", "documentIds": ["..."], "topK": 8 }
```

**200**

```json
{
  "answer": "Call POST /auth/token with your client id and secret to obtain a bearer token [1]. The token is valid for 3600 seconds [1], and you send it in the Authorization header on every request [1].",
  "citations": [
    {
      "n": 1,
      "chunkId": "...",
      "documentId": "...",
      "documentTitle": "lumen-api",
      "headingPath": "Lumen API > Authentication",
      "pageStart": null,
      "pageEnd": null,
      "snippet": "Call POST /auth/token with your client id and client secret…"
    }
  ],
  "usage": { "inputTokens": 912, "outputTokens": 64, "costUsd": 0.001256 }
}
```

**400** when the question is empty or too long.

## Acceptance criteria

**AC1.** Given a question answerable from the corpus, when it is asked, then the
answer contains at least one citation marker.

**AC2.** Given an answer with markers, when it is returned, then every citation
listed maps to a chunk that was actually in the context.

**AC3.** Given an answer citing a number that was not supplied, when it is
processed, then that marker is removed from the answer text and omitted from the
citations.

**AC4.** Given an answer citing the same number twice, when it is processed,
then one citation is returned, not two.

**AC5.** Given citations numbered out of order in the answer, when they are
returned, then the list is ordered by the number as it appears.

**AC6.** Given a question the corpus cannot answer, when it is asked, then the
answer says so and no citation is fabricated.

**AC7.** Given retrieval returns nothing, when the question is answered, then
the model is not called at all and the "do not know" answer is returned
directly.

**AC8.** Given a question in Portuguese, when the prompt is built, then it
instructs the model to answer in the language of the question.

Deliberately phrased as a property of the prompt rather than of the answer. The
answer's language is a model behaviour, and the only honest way to assert it is
to run a real model against questions in both languages — which is what M7's
eval set does, with Portuguese cases of its own. Asserting it against the
deterministic mock would test the mock.

**AC9.** Given a context block, when the prompt is built, then it carries its
number, document title and heading path, so a citation can be rendered without a
second lookup.

**AC10.** Given `documentIds`, when a question is asked, then only those
documents are searched.

**AC11.** Given an answer, when it is produced, then the call's tokens and cost
are recorded in the usage ledger.

**AC12.** Given an empty or whitespace-only question, when it is asked, then the
request is rejected.

**AC13.** Given a question longer than the limit, when it is asked, then it is
rejected before reaching the provider.

**AC14.** Given the model returns an empty response, when it is processed, then
the caller gets a typed error rather than an empty answer.

**AC15.** Given a citation, when it is returned, then its snippet is the chunk's
own text, not the heading-prefixed text used for embedding.

## Edge cases and failure modes

- **The model ignores the instruction and answers from training.** Not fully
  preventable by prompting. The mitigation is measurement: M7's faithfulness
  evals score whether each claim is supported by its cited chunk.
- **A marker inside a code block**, such as an array index in a sample. Markers
  are parsed outside fenced regions only, so `arr[1]` in a code sample is not
  mistaken for a citation.
- **The provider fails mid-answer.** Surfaces as a typed error; the
  non-streaming endpoint has no partial answer to salvage.
- **Context longer than the model's window.** `RETRIEVAL_TOP_K` bounds it, and
  chunks have a known token ceiling, so the worst case is computable rather than
  discovered.

## Non-goals

- Streaming. `POST /ask` is non-streaming; the streaming chat endpoint is M3.
- Conversation history. One question, one answer.
- Tool use. That is the agent in M4.
- Reranking before the prompt. Behind `FF_RERANK`, measured in M7.

## Test plan

| AC                           | Level                | File                                    |
| ---------------------------- | -------------------- | --------------------------------------- |
| AC2–AC5, AC15                | unit                 | `apps/api/src/chat/citations.spec.ts`   |
| AC8, AC9                     | unit                 | `apps/api/src/chat/prompt.spec.ts`      |
| AC1–AC3, AC6, AC7, AC10–AC15 | unit with mock model | `apps/api/src/chat/ask.service.spec.ts` |
| AC1, AC2, AC11–AC13          | API e2e              | `apps/api/test/e2e/ask.spec.ts`         |
| response shape               | contract (Ajv)       | `apps/api/test/contract/ask.spec.ts`    |

The model is a **scripted** mock throughout — told exactly what to return, so
every citation case is provoked on purpose rather than hoped for. Testing
"strips a citation the model invented" needs a model that invents one, which is
not something a real provider can be asked for on demand.

The one thing the mock cannot establish is AC8: whether the answer actually
comes back in the question's language. That is model behaviour, and it is
measured against a real provider in M7's eval set. What is asserted here is the
instruction, which is the part this repository controls.

## Open questions

Whether an answer whose every citation was dropped as invalid should be returned
at all, or treated as a failure. Currently returned, with no citations, because
the prose may still be useful. M7's faithfulness scores should settle it.
