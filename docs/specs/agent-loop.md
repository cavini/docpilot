# Spec: The agent loop

Status: accepted Milestone: M4

## Problem and goal

`/chat` answers questions. It cannot do anything else: it retrieves once, in one
fixed way, and everything it can say has to come out of that one retrieval.

"Summarise the billing guide" needs every chunk of one document, not the eight
most similar to the question. "List all the endpoints as JSON" needs a
schema-constrained extraction, not prose. "Open a ticket for this" needs an
action.

The goal is a loop where the model chooses which of a small set of tools to
call, sees the result, and decides what to do next — bounded, observable, and
unable to take an irreversible action without being asked.

## Behaviour

**The loop.** The model is given the question, the conversation so far, and the
tool definitions. It may call tools; each result is fed back and it is called
again. The loop ends when the model answers in text, or when the step limit is
reached.

**A step limit, always.** `AGENT_MAX_STEPS` bounds the number of model calls. A
model that keeps calling tools — because a tool keeps failing, or because it has
misunderstood — costs money on every step and would otherwise run until the
request times out.

**Tool steps are visible.** Each call appears in the stream as it happens: the
tool name, its input, its status, and its output when it arrives. An agent whose
work is invisible is impossible to trust or to debug.

**Approval before anything irreversible.** `create_ticket` is not executed until
the reader approves it. The model proposes; the person decides. Denying is not
an error: the model is told it was denied and continues.

**Tool errors go back to the model**, structured, not thrown. A tool that fails
is information the model can act on — retry with different arguments, or tell
the reader it could not. An exception would end the turn with nothing.

**Per-tool timeouts.** A tool that hangs must not hang the request. The timeout
produces the same structured error as any other failure.

**Behind a flag.** `FF_AGENT_TOOLS` off means `/agent` behaves like `/chat` with
no tools. The capability can be turned off on a public demo without a redeploy.

## API contract

### `POST /agent`

Same request shape as [`/chat`](./streaming-chat.md), same UI message stream
response, plus the SDK's tool parts: `tool-input-start`, `tool-input-delta`,
`tool-input-available`, `tool-output-available`, `tool-output-error`, and
`tool-approval-request` where approval is needed.

A denied call produces `tool-output-denied`.

The client answers an approval request with the AI SDK's
`addToolApprovalResponse({ id, approved })`, which continues the same stream.

## Acceptance criteria

**AC1.** Given a question answerable from retrieval, when it is asked, then the
model calls `search_docs` and answers from its result.

**AC2.** Given a tool call, when it runs, then its name, input and output appear
in the stream.

**AC3.** Given a model that calls tools forever, when the step limit is reached,
then the loop stops and the turn ends.

**AC4.** Given the step limit is reached, when the turn ends, then the reader is
told the agent stopped rather than being shown an empty answer.

**AC5.** Given a tool that throws, when it is called, then the model receives a
structured error and the turn continues.

**AC6.** Given a tool that hangs, when its timeout elapses, then it fails as a
structured error rather than hanging the request.

**AC7.** Given `create_ticket` is called, when it is proposed, then it is not
executed until the reader approves.

**AC8.** Given an approval request, when the reader approves, then the tool runs
and its output reaches the model.

**AC9.** Given an approval request, when the reader denies it, then **no ticket
is created** and the model is told it was denied.

**AC10.** Given `FF_AGENT_TOOLS` is off, when a question is asked, then no tools
are offered and the endpoint answers like `/chat`.

**AC11.** Given a tool call, when it completes, then its tokens and cost are in
the usage ledger alongside the model calls.

**AC12.** Given the mock provider, when the agent runs, then the whole loop
works with no key and no cost.

## Edge cases and failure modes

| Situation                                  | Behaviour                                                         |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Model calls an unknown tool                | The SDK rejects it; the model is told and may retry               |
| Model sends arguments that fail the schema | Structured validation error back to the model                     |
| Reader abandons an approval request        | The stream ends with the request outstanding; nothing is executed |
| Client disconnects mid-loop                | Generation is aborted; a partial turn is stored                   |
| A tool returns an enormous result          | Truncated with a note, so one tool cannot blow the context window |
| Step limit reached mid-tool-call           | The call completes; the loop does not start another step          |

## Non-goals

- Parallel tool calls. One at a time keeps the transcript readable, and nothing
  here benefits from concurrency.
- Tools that reach outside this application. `create_ticket` is a mock.
- Planning, reflection, or sub-agents.
- Letting the reader edit a tool's arguments before approving.

## Test plan

| AC                  | Level                   | File                                       |
| ------------------- | ----------------------- | ------------------------------------------ |
| AC3, AC5, AC6, AC10 | unit with scripted mock | `apps/api/src/agent/agent.service.spec.ts` |
| AC1, AC2, AC11      | integration             | `apps/api/test/integration/agent.spec.ts`  |
| AC4, AC7, AC9, AC12 | API e2e                 | `apps/api/test/e2e/agent.spec.ts`          |
| stream shape        | contract                | `apps/api/test/contract/agent.spec.ts`     |
| AC2, AC7–AC9        | browser e2e             | `apps/web/e2e/agent.spec.ts`               |

AC3 needs a model that calls tools forever, which is exactly what a real one
will not reliably do on request — the scripted mock is told to.

## Open questions

Whether the step limit should be a token budget instead. Steps are predictable
and easy to explain; a budget is what actually bounds cost. Revisit with the M7
evals, which can measure how many steps real questions take.
