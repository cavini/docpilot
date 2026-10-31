# Spec: `create_ticket`

Status: accepted Milestone: M4

## Problem and goal

Every tool so far reads. This one writes, and that changes what the loop has to
guarantee: a model that misunderstands a question should not be able to create
something.

It is a **mock** — no issue tracker is involved. What is real is the approval
mechanism, which is the part worth building and the part that would have to be
right if the tracker were real.

## Behaviour

**Nothing happens without approval.** The model proposes a ticket; the reader
sees the title, body and labels it proposed and approves or denies. Only then
does the tool run.

**Denial is not an error.** The model is told the reader declined and continues
— it might explain, or offer something else. Treating a denial as a failure
would make the agent argue with the person using it.

**An abandoned request creates nothing.** If the stream ends with an approval
outstanding, no ticket exists. The default is always "did not happen".

**The ticket is stored**, so "did it work" has an answer that is not the model's
word for it, and so the e2e test can assert that denying created nothing.

## Input

```ts
{
  title: string;              // 1–120 characters
  body: string;               // 1–4000 characters
  labels?: string[];          // at most 10
}
```

## Output

```ts
{
  id: string;
  title: string;
  createdAt: string;
  url: string; // a mock URL, clearly marked as such
}
```

## Acceptance criteria

**AC1.** Given the model calls the tool, when it is proposed, then the stream
carries an approval request and the tool has **not** run.

**AC2.** Given an approval request, when the reader approves, then the ticket is
created and its id reaches the model.

**AC3.** Given an approval request, when the reader denies it, then **no ticket
row exists** and the model is told it was denied.

**AC4.** Given a stream that ends with an approval outstanding, when it closes,
then no ticket exists.

**AC5.** Given a title over the limit, when the tool is called, then the schema
rejects it before any approval is asked for.

**AC6.** Given a created ticket, when it is returned, then its URL is clearly a
mock rather than something that looks real.

**AC7.** Given the reader, when the approval is shown, then the title, body and
labels the model proposed are all visible — approving something unseen is not
approval.

## Edge cases and failure modes

| Situation                                    | Behaviour                                    |
| -------------------------------------------- | -------------------------------------------- |
| Two tickets proposed in one turn             | Each gets its own approval                   |
| Reader approves twice                        | The second response is ignored; one ticket   |
| Reader denies, model proposes the same again | Allowed; the reader may have wanted a change |

## Non-goals

- A real issue tracker. The integration is the easy part; the approval is not.
- Editing the proposal before approving. Deny and ask again.
- Listing or deleting tickets.

## Test plan

| AC            | Level       | File                                                  |
| ------------- | ----------- | ----------------------------------------------------- |
| AC5           | unit        | `apps/api/src/agent/tools/create-ticket.tool.spec.ts` |
| AC2, AC6      | integration | `apps/api/test/integration/agent.spec.ts`             |
| AC1, AC3, AC4 | API e2e     | `apps/api/test/e2e/agent.spec.ts`                     |
| AC1, AC3, AC7 | browser e2e | `apps/web/e2e/agent.spec.ts`                          |

AC3 is asserted by counting rows, not by reading the model's reply. The whole
point is that the model's account of what happened is not evidence.
