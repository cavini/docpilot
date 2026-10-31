# Spec: Streaming chat

Status: implemented Milestone: M3

## Problem and goal

`POST /ask` answers in one shot. For a question whose answer takes eight seconds
to generate, the user watches a spinner for eight seconds and then gets
everything at once. That feels broken even though nothing is.

The goal is an answer that arrives as it is written, in a conversation that
remembers what was said before, with citations attached to the message rather
than guessed at from its text.

## Behaviour

**Streaming.** Tokens appear as the model produces them. The first token should
arrive about as fast as retrieval allows, because retrieval happens before the
model is called.

**Citations arrive first.** The retrieved passages are known before generation
starts, so they are sent as a data part ahead of the text. The UI can render the
sources panel while the answer is still being written, and a citation chip is
clickable the moment the marker appears.

**Stopping.** A stop button aborts the stream. The partial answer stays visible,
is marked as stopped, and is persisted — a partial answer is still something the
user read, and silently discarding it loses the context of what they ask next.

**History.** A conversation is a list of turns. Each new question is answered
with the previous turns in the prompt, so "and what about the other one?" works.
Conversations can be listed, resumed and deleted.

**Retrieval is per question, not per conversation.** Each question runs its own
hybrid search. Reusing the first question's passages for a follow-up would
answer the wrong question confidently.

**Failure.** A provider error produces a message in the conversation saying so,
with a retry that re-asks the same question — not a toast that disappears and
leaves a conversation with a gap in it.

## API contract

### `POST /chat`

Request:

```json
{
  "conversationId": "7f3a9c0e-…",
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "How do I authenticate?" }]
    }
  ],
  "documentIds": ["7f3a9c0e-…"]
}
```

`conversationId` is optional; omitting it starts one and the id comes back in
the stream. `documentIds` is optional and restricts retrieval.

Response is the AI SDK **UI message stream** (server-sent events,
`content-type: text/event-stream`), so the client consumes it with `useChat`
rather than a hand-written parser. Two custom data parts are written:

| Part                | When                             | Payload                     |
| ------------------- | -------------------------------- | --------------------------- |
| `data-conversation` | first, once                      | `{ conversationId }`        |
| `data-citations`    | after retrieval, before any text | `{ citations: Citation[] }` |

`Citation` is the shape `/ask` already returns: `n`, `chunkId`, `documentId`,
`documentTitle`, `headingPath`, `pageStart`, `pageEnd`, `snippet`.

Errors inside a stream are sent as an error part, because the status code is
already 200 by the time generation starts. Errors before the stream opens —
validation, an empty question — are ordinary JSON failures with the shape in
[`api.md`](../api.md#every-failure-has-one-shape).

### `GET /conversations`, `GET /conversations/{id}`, `DELETE /conversations/{id}`

List is newest first with the same cursor pagination as documents. Read one
returns its messages in order, each with its citations. Delete is 204.

## Acceptance criteria

**AC1.** Given a question answerable from the corpus, when it is asked, then
text arrives in more than one chunk rather than all at once.

**AC2.** Given retrieval has run, when the stream starts, then the citations
data part is sent before the first text chunk.

**AC3.** Given a new conversation, when the stream starts, then the
`conversationId` is sent in the stream so the client can resume it.

**AC4.** Given an answer with markers, when the stream ends, then every `[n]` in
the text maps to a citation that was sent.

**AC5.** Given a conversation with previous turns, when a follow-up is asked,
then the previous turns are in the prompt.

**AC6.** Given a follow-up, when it is answered, then retrieval runs again for
that question rather than reusing the previous passages.

**AC7.** Given a stream in progress, when the client aborts, then generation
stops and the partial answer is persisted.

**AC8.** Given a stopped answer, when the conversation is resumed, then the
partial text is there and marked as stopped.

**AC9.** Given a provider failure mid-stream, when it happens, then an error
part is sent and the conversation keeps the question.

**AC10.** Given an empty or whitespace-only question, when it is posted, then
the request is rejected before the stream opens.

**AC11.** Given a question longer than the limit, when it is posted, then it is
rejected before reaching the provider.

**AC12.** Given a completed answer, when it is stored, then the call's tokens
and cost are in the usage ledger.

**AC13.** Given `documentIds`, when a question is asked, then only those
documents are searched.

**AC14.** Given a conversation, when it is deleted, then its messages and
citations go with it.

**AC15.** Given the mock provider, when a question is asked, then the whole path
works end to end with no key and no cost.

## Edge cases and failure modes

| Situation                                  | Behaviour                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Retrieval finds nothing                    | The refusal is streamed as the answer, with no citations and no model call  |
| Model returns empty                        | An error part, not an empty assistant message                               |
| Client disconnects without aborting        | Generation is cancelled when the response stream closes                     |
| Conversation id that does not exist        | 404 before the stream opens                                                 |
| Conversation grows past the context window | Oldest turns are dropped, newest kept, and the prompt says it was truncated |
| Two questions in one conversation at once  | Serialised per conversation; the second waits                               |

## Non-goals

- Editing or regenerating an earlier answer.
- Branching a conversation.
- Sharing a conversation by link.
- Tool calling. That is M4, and the loop is built to accept it.
- Summarising old turns instead of dropping them.

## Test plan

| AC                             | Level                   | File                                     |
| ------------------------------ | ----------------------- | ---------------------------------------- |
| AC2, AC4                       | unit                    | `apps/api/src/chat/stream-parts.spec.ts` |
| AC5                            | unit                    | `apps/api/src/chat/history.spec.ts`      |
| AC1, AC3, AC6, AC9, AC12, AC15 | unit with scripted mock | `apps/api/src/chat/chat.service.spec.ts` |
| AC7, AC8, AC14                 | integration             | `apps/api/test/integration/chat.spec.ts` |
| AC10, AC11, AC13               | API e2e                 | `apps/api/test/e2e/chat.spec.ts`         |
| stream shape                   | contract                | `apps/api/test/contract/chat.spec.ts`    |

The model is the scripted mock throughout. A real provider cannot be asked to
stop after three chunks, or to fail mid-stream, on demand.

## Open questions

Whether dropping the oldest turns is good enough, or whether they should be
summarised. Dropping is implemented because it is predictable and cheap;
summarising costs a model call per turn and can lose the detail that mattered.
Revisit with the M7 evals, which can measure it.
