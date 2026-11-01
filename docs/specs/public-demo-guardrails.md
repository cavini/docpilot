# Spec: Guarding a public demo

Status: accepted Milestone: M5.5 (M7's guardrails, brought forward)

## Problem and goal

The app is about to be hosted at a public URL with my own provider balance
behind it. Every question costs me money, every upload costs me money and
storage, and an uploaded document is text a model will read and might obey.

The brief schedules guardrails for M7. I am bringing them forward because the
deploy is imminent, and a guardrail added after the first abuse is a guardrail
added too late.

The goal is to be able to publish the link.

## What I am actually defending against

Ranked by what it costs me, which is not the same as ranked by how alarming it
sounds.

| Threat                              | Costs me                    | What stops it    |
| ----------------------------------- | --------------------------- | ---------------- |
| Someone burns the provider balance  | Money, directly             | The spend cap    |
| Someone fills the corpus or storage | Money, and the demo's point | Resource caps    |
| A crawler finds the endpoints       | Money, slowly               | The key          |
| Request floods                      | Availability                | Rate limits      |
| An uploaded document giving orders  | Trust in every answer       | Prompt structure |
| Raw HTML in an answer               | A cross-site scripting bug  | The renderer     |

**The key is the weakest of these and the one people ask for first.** I will
paste it into messages to recruiters; it will be forwarded, screenshotted and
eventually indexed. It keeps crawlers out, which is worth having. It is not a
boundary, and nothing downstream will be designed as though it were.

**The spend cap is the one that matters.** A request-count limit does not bound
cost: one agent turn can be six model calls and a cached search can be zero, so
"sixty requests an hour" is a number with no dollars in it. The ledger already
records `costUsd` per call, indexed on `createdAt`. Summing a day of it is the
measure, and the measure is what gets capped.

## Behaviour

### The gate

One shared secret in `DEMO_API_KEY`, sent as `x-demo-key` on every request. A
global guard rejects anything without it.

**Empty means off.** Local development and the whole test suite run with no key
and no ceremony. A deployment that forgets to set one is open, which is why the
deployment checklist names it and the startup log says plainly which guards are
active.

**Compared in constant time**, on digests rather than on the raw strings: a
digest is always 32 bytes, so the comparison cannot throw on a length mismatch
and cannot leak the key's length by returning early.

**Never logged.** Not at `debug`, not in an error, not in a request dump.

`GET /health/live` and `GET /health` stay open, because the hosting platform's
health check has no key and a demo that reports itself unhealthy is a demo that
gets restarted in a loop.

`GET /access` is how a client checks a key before storing it. It returns what
the interface needs to render honestly: whether the budget is spent.

### The spend cap

`DAILY_BUDGET_USD` is a ceiling on `sum(costUsd)` over the last 24 hours, read
from `llm_usage`. Checked **before** a call, not after — after is a bill.

At or above the ceiling the behaviour differs by what the call would leave
behind:

| Path                          | At the cap  | Why                                                          |
| ----------------------------- | ----------- | ------------------------------------------------------------ |
| `/chat`, `/agent`, `/extract` | Mock        | Degraded output is disposable; the tab closes and it is gone |
| Ingestion (embedding)         | **Refused** | Degraded stored state is permanent                           |

A document embedded by the mock is a document that sits in the corpus returning
confident nonsense for every future search, and nothing in the interface would
ever say so. Refusing an upload is visible and recoverable. Accepting a poisoned
one is neither.

A reader on the mock path is told, in both languages, rather than being left to
conclude the product is bad.

A call already in flight when the cap is crossed finishes. The check is a gate
at the start, not a kill switch.

### Rate limits

Redis-backed, keyed per client, tighter where each request costs more:

| Routes                        | Limit     | Because                      |
| ----------------------------- | --------- | ---------------------------- |
| Upload                        | Strictest | Embeddings, storage, and CPU |
| `/chat`, `/agent`, `/extract` | Moderate  | One or more model calls      |
| Reads                         | Generous  | A database query             |

Keyed on the client address, with the caveat written down rather than implied:
behind a proxy this is `X-Forwarded-For`, which is only as trustworthy as the
proxy that sets it. It is a blast-radius limiter, not an identity.

### Resource caps

| Cap                  | Stops                                   |
| -------------------- | --------------------------------------- |
| `MAX_UPLOAD_MB`      | One enormous file (exists)              |
| `MAX_DOCUMENTS`      | Many small ones filling the corpus      |
| `MAX_QUESTION_CHARS` | A prompt-sized question billed as input |
| `MAX_OUTPUT_TOKENS`  | A runaway answer (exists)               |
| `AGENT_MAX_STEPS`    | A tool loop that never settles (exists) |

### Injection

The system prompt already labels retrieved passages as data rather than
instructions. What is added here is the proof: a document written to attack,
committed to the repository, with tests asserting what the agent does with it.

Uploaded text reaches a model and reaches a renderer, so both are covered: the
model must report an instruction rather than follow it, and the renderer must
not turn a document's HTML into an element.

## API contract

### `GET /access`

```bash
curl localhost:3001/access -H 'x-demo-key: ...'
```

```json
{
  "ok": true,
  "budget": { "spent": false, "resetsAt": "2026-11-02T00:00:00.000Z" }
}
```

**401** with the standard error shape when the key is wrong or missing. The
message says a key is needed and does **not** say whether the one supplied was
close.

### Every other endpoint

Unchanged, plus:

| Status | When                                                |
| ------ | --------------------------------------------------- |
| 401    | The key is missing or wrong                         |
| 429    | The rate limit is exceeded; `Retry-After` says when |
| 503    | An upload while the budget is spent                 |

Streaming endpoints carry a `data-budget` part when answering from the mock, so
the interface can say so without a second request.

## Acceptance criteria

**AC1.** Given `DEMO_API_KEY` is set and a request arrives without the header,
then the response is 401 and the handler does not run.

**AC2.** Given a wrong key, when it is compared, then the comparison is constant
time and reveals nothing about the real key's length.

**AC3.** Given `DEMO_API_KEY` is empty, when any request arrives, then it is
served — local development and the test suite need no key.

**AC4.** Given the health endpoints, when they are called without a key, then
they answer, because the platform's probe has none.

**AC5.** Given the web app with no stored key, when it loads, then **no request
to the API is made at all** and the unlock form is shown.

**AC6.** Given a stored key the server rejects, when a request fails with 401,
then the key is discarded and the unlock form returns.

**AC7.** Given the key, when it is handled anywhere on the server, then it never
appears in a log line, an error body, or a trace.

**AC8.** Given more requests than the window allows, then the response is 429
and says when to retry.

**AC9.** Given the three route groups, then uploading is limited more tightly
than asking, and asking more tightly than reading.

**AC10.** Given recorded spend below `DAILY_BUDGET_USD`, when a question is
asked, then a real provider answers.

**AC11.** Given recorded spend at or above it, when a question is asked, then
the mock answers and the response says the budget is spent.

**AC12.** Given spend at or above it, when a document is uploaded, then the
upload is **refused** rather than embedded by the mock.

**AC13.** Given the budget is spent, when the page renders, then it says so in
the reader's language.

**AC14.** Given a call already streaming when the cap is crossed, then it
finishes rather than being cut off.

**AC15.** Given the corpus already holds `MAX_DOCUMENTS`, when another is
uploaded, then it is refused and the message says why.

**AC16.** Given a question longer than `MAX_QUESTION_CHARS`, when it is sent,
then it is refused **before** any model call.

**AC17.** Given a document containing an instruction aimed at the model, when it
is retrieved and answered from, then the answer reports the instruction rather
than obeying it.

**AC18.** Given that document, when the agent reads it, then no ticket is
created without the reader's approval.

**AC19.** Given a document containing HTML, when an answer quoting it is
rendered, then the HTML is text rather than an element.

**AC20.** Given the application starts, then the log states which guards are
active, so a deployment missing one is visible at boot rather than at the bill.

## Edge cases and failure modes

| Situation                                       | Behaviour                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Redis is down and the rate limiter cannot count | Serve, and log it. A dead demo is worse than an uncounted request |
| The ledger is unreachable                       | Treat the budget as spent. Unknown spend is not zero spend        |
| `DAILY_BUDGET_USD` is 0                         | No ceiling, stated explicitly in the startup log                  |
| Two requests cross the cap at once              | Both may be served. The ceiling is a ceiling, not an accountant   |
| A key with a trailing newline, pasted           | Trimmed before comparison, because people paste                   |
| The key is right but the budget is spent        | 200 with mock answers, not 401. They are different problems       |

## Non-goals

- Per-visitor keys, quotas or revocation. One shared secret, rotated by
  redeploying. If the demo needs real accounts it needs real authentication, and
  that is M8's problem, not a half-measure here.
- Hiding that this is a demo. The limits are stated in the interface.
- Preventing someone with the key from reading another visitor's uploads. The
  corpus is shared and the README will say so.
- Blocking abuse by content. I am not classifying questions.

## Test plan

| AC                | Level        | File                                                 |
| ----------------- | ------------ | ---------------------------------------------------- |
| AC1–AC4, AC7      | unit         | `apps/api/src/access/demo-key.guard.spec.ts`         |
| AC10–AC12, AC14   | unit         | `apps/api/src/budget/budget.service.spec.ts`         |
| AC1, AC4, AC8–AC9 | API e2e      | `apps/api/test/e2e/access.spec.ts`                   |
| AC12, AC15, AC16  | integration  | `apps/api/test/integration/guardrails.spec.ts`       |
| AC17, AC18        | integration  | `apps/api/test/integration/injection.spec.ts`        |
| AC5, AC6, AC13    | unit (jsdom) | `apps/web/src/features/access/*.test.tsx`            |
| AC19              | component    | `apps/web/cypress/component/answer-injection.cy.tsx` |
| AC5, AC6, AC13    | browser e2e  | `apps/web/e2e/access.spec.ts`                        |
| AC20              | unit         | `apps/api/src/main.spec.ts`                          |

AC2 is asserted structurally rather than by timing. A benchmark that measures
two comparisons and claims they are equal is a flaky test wearing a security
hat; asserting that the code hashes both sides and uses `timingSafeEqual` is the
honest check, and the review is the rest.

AC5 is the one most easily tested into meaninglessness. Asserting that the form
is visible would pass while the app quietly called the API behind it, so the
test asserts that `fetch` was **never called**.

## Open questions

What `DAILY_BUDGET_USD` should actually be. At roughly $0.007 a question, fifty
cents a day is about seventy questions — generous for a portfolio demo and a
tenth of the balance if every day were maxed out. Starting there.
