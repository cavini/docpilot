# Security and guardrails

The ways a document-answering system can be abused, and what is done about each.

This is a single-user portfolio project hosted at a public URL with my own
provider balance behind it. That shapes everything below: there are no accounts,
the corpus is shared, and the thing most worth protecting is a prepaid balance
rather than anyone's data.

## What I am actually defending against

Ranked by what it costs me, which is not the same as ranked by how alarming it
sounds.

| Threat                              | Costs me                    | Stopped by          |
| ----------------------------------- | --------------------------- | ------------------- |
| Someone burns the provider balance  | Money, directly             | The spend ceiling   |
| Someone fills the corpus or storage | Money, and the demo's point | Resource caps       |
| A crawler finds the endpoints       | Money, slowly               | The demo key        |
| Request floods                      | Availability                | Rate limits         |
| A malicious file                    | The host, in the worst case | What the parser is  |
| An uploaded document giving orders  | Trust in every answer       | Prompt and approval |
| Markup in an answer                 | A cross-site scripting bug  | The renderer        |

## The demo key is the weakest of these

One shared secret in `DEMO_API_KEY`, sent as `x-demo-key`. A global guard
rejects everything without it; routes are closed unless marked `@Public()`, so
an endpoint added later is protected because nobody did anything rather than
because somebody remembered. The only public routes are the health endpoints,
because the hosting platform's probe has no key.

**It is a speed bump, not a boundary.** I hand it out; it gets forwarded and
screenshotted, and one day it is indexed. What it buys is that a crawler which
finds the URL cannot spend anything. Nothing downstream is designed as though it
were an identity: the spend ceiling is enforced whether or not the caller has
the key.

Compared on SHA-256 digests rather than on the strings. A digest is always 32
bytes, so the comparison cannot throw on a length mismatch — and because it
cannot, it never returns early on length, which is the one thing a naive
comparison leaks for free. The refusal names the header and says nothing else:
not the value, not the length, not whether it was close.

The browser never sends a request without a key when one is required. Whether
one is required is read from the build, not asked of the API, because a client
that probes an endpoint to learn whether it may call endpoints has already
called one.

The websocket is checked separately. An upgrade carries no route for a guard to
attach to, so the key travels in the handshake and is checked at connect —
otherwise a gated deployment would have left exactly one way in open.

## The spend ceiling is the one that matters

`DAILY_BUDGET_USD` caps what a UTC day of model calls may cost, summed from
`llm_usage`, which already records the cost of every call.

**A request limit is not a cost limit.** One agent turn can be six model calls
and a cached search can be none, so "sixty requests an hour" is a number with no
dollars in it. Only the ledger knows what was actually spent.

Past the ceiling the behaviour differs by what the call would leave behind:

| Path                                  | At the ceiling | Why                                                          |
| ------------------------------------- | -------------- | ------------------------------------------------------------ |
| `/ask`, `/chat`, `/agent`, `/extract` | Mock           | Degraded output is disposable; the tab closes and it is gone |
| Upload and ingestion                  | **Refused**    | Degraded stored state is permanent                           |

A document embedded by the mock would sit in the corpus returning confident
nonsense for every future search, and nothing in the interface would ever say
so. A refused upload is visible and recoverable; a poisoned one is neither.

Two defaults worth naming:

- **A ledger that cannot be read counts as exhausted.** Unknown spend is not
  zero spend, and the failure worth guarding is a database blip quietly removing
  the only thing between a public URL and my balance.
- **A degraded call records against the mock**, not against the configured
  provider, so the number the ceiling reads cannot inflate itself.

## What an uploaded file can and cannot do

This is the question I was asked, so it is answered in detail.

### What is checked before anything is stored

| Check               | What it rejects                                      |
| ------------------- | ---------------------------------------------------- |
| Size                | Anything over `MAX_UPLOAD_MB`                        |
| Emptiness           | Zero bytes, which would reach `ready` with no chunks |
| Extension allowlist | Anything that is not `.pdf`, `.md`, `.txt`           |
| Magic bytes         | A file named `.pdf` whose bytes are not a PDF        |
| Corpus size         | Anything past `MAX_DOCUMENTS`                        |
| Spend ceiling       | Anything that would need embedding past the budget   |

The declared `Content-Type` is treated as a claim, not a fact: browsers send
`application/octet-stream` for Markdown often enough that trusting it would
reject real uploads, and trusting it for a PDF would let a renamed binary
through. The signature wins where there is one.

### The file is never executed, served, or named by the uploader

- **Stored under its id**, at `documents/{uuid}/original`. The filename is kept
  for display and used for nothing else; used as a path it would be a traversal.
  The local-disk driver additionally refuses any key that resolves outside its
  root.
- **Never served back.** The original bytes are read once, by the ingestion
  worker, and never returned to a browser. There is no download endpoint. A
  stored file cannot become a stored cross-site scripting payload, because
  nothing ever serves it with a content type.
- **Never shelled out to.** No `exec`, no `spawn`, no temporary file written
  under a name the uploader chose.

### What happens to a PDF

Text is extracted with `unpdf`, which bundles a pdf.js build. Only `extractText`
is called — the document is never rendered, so the font and image pipelines are
not reached.

A PDF can carry JavaScript three ways: an `/OpenAction`, a document-level `/AA`
action, and a named `/JavaScript` entry. **None of them run.** That is tested
rather than assumed: the suite builds a PDF carrying all three, whose payload
sets a global, uploads it, ingests it, and asserts the global is still undefined
— and separately that the text came through, so "nothing ran" cannot be mistaken
for "nothing was read".

The action dictionaries are not part of the text layer, so the payload does not
reach a prompt either.

### What happens to text

Everything a reader types is a DTO validated by Zod with `whitelist` and
`forbidNonWhitelisted`, so an unexpected field is rejected rather than carried
inward. Questions are capped at `MAX_QUESTION_LENGTH` **before** any model call,
so an oversized prompt costs nothing.

Every database query goes through Drizzle with bound parameters. The one place
SQL is written by hand — hybrid retrieval — interpolates only through `sql`
template parameters, never by string concatenation.

## Prompt injection

A document can contain text aimed at the model. It is kept rather than stripped:
pretending the text says something else is a worse failure than reading it, and
a reader who uploads a hostile document should be able to ask about it. What
matters is the framing and the gates.

- **Retrieved passages are labelled as data.** The system prompt says to treat
  them as reference material and to report an instruction rather than follow it.
- **Nothing that writes runs without the reader.** `create_ticket` is the only
  tool with an effect, and the loop will not execute it until the reader
  answers. The test scripts the outcome the injection wants — the model calling
  `create_ticket` with the attacker's words — and asserts no row appears. A real
  model cannot be made to obey on demand, and this is the stronger claim anyway:
  not "the model resists" but "nothing is written without the reader, whatever
  the model was persuaded to attempt".
- **Tools are an allowlist.** There is no arbitrary network access, no
  filesystem access and no shell.

The attack document lives at `apps/api/test/fixtures/injection.md`.

**What injection can still do:** make an answer wrong or strange. A document
that says "the refund window is ninety days" will produce an answer saying
ninety days. Citations are the mitigation — the reader can follow the marker to
the passage and see where it came from — not a fix.

## Rendering

Answers are Markdown rendered by `react-markdown` **without** `rehype-raw`, so
raw HTML in a document never becomes an element. A `<script>` tag, an
`<img onerror=…>` and a `javascript:` link are all asserted inert in a real
browser.

One honest detail: the tags are _dropped_, not escaped. A reader sees the text
that was between them with nothing saying it arrived wrapped in a script tag.
Safe, and lossy.

## Rate limits

Redis-backed, per client address, in three tiers by what a request costs: reads
are generous, anything reaching a model is moderate, uploads are strict. A route
that is added without anyone thinking about cost gets the loose default rather
than no limit.

The client address comes from `req.ip`, which believes `X-Forwarded-For` only
when `TRUST_PROXY` is set. Without a proxy that overwrites it, that header is a
client-supplied string and trusting it would make every limit free to bypass.

Health endpoints are never counted. A demo restarted because it rate-limited its
own health check is worse than one that is not limited at all.

The key is checked before the limit is counted, so a flood of unauthenticated
requests writes nothing — asserted on the Redis keys directly, after a first
version of that test turned out to be reading a counter the tests before it had
already moved.

## Said at boot

Every guard is named in one line in the startup log, phrased so the dangerous
states are the loud ones:

```
guards: demo key OPEN, spend ceiling NONE, rate limits on, corpus unlimited, uploads <= 20 MB
```

A reader skimming a deployment's logs should trip over `OPEN`, not have to
notice that a number is zero. A test asserts the key itself never appears there.

## Known gaps, stated plainly

- **The key will leak.** It is shared, and rotating it means a redeploy that
  locks everyone out at once. If this needed real access control it would need
  real accounts, and a half-measure in between would be worse than either.
- **The corpus is shared.** Anyone with the key sees everyone's uploads. There
  is no per-visitor isolation and nothing pretends there is.
- **An IP is not a person.** Two visitors behind one NAT share an allowance; one
  visitor with a VPN has several. The limit bounds blast radius, not identity.
- **Text expansion is unbounded.** `MAX_UPLOAD_MB` caps the bytes that arrive,
  not the text they expand into, so a small dense PDF can produce a lot of
  chunks. The spend ceiling catches the cost; nothing catches the memory.
- **No malware scanning.** The bytes are never executed or served, which is why
  I am comfortable with that, but they are stored.
- **Two requests can cross the ceiling together.** The check is a gate at the
  start of a call, not a transaction. The ceiling is a ceiling, not an
  accountant.
- **Nothing is encrypted at rest beyond what the storage provider does.**

## Where each claim is tested

| Claim                                   | File                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| Key comparison, the guard, what it says | `apps/api/src/access/*.spec.ts`                      |
| The gate over real HTTP and websockets  | `apps/api/test/e2e/access.spec.ts`                   |
| Limits, ordering, `Retry-After`         | `apps/api/test/e2e/rate-limit.spec.ts`               |
| The ceiling's rule and its fail-closed  | `apps/api/src/budget/*.spec.ts`                      |
| Degrading and refusing at the ceiling   | `apps/api/test/integration/guardrails.spec.ts`       |
| What an uploaded file cannot do         | `apps/api/test/integration/injection.spec.ts`        |
| Approval holds under injection          | `apps/api/test/e2e/agent.spec.ts`                    |
| Markup never becomes an element         | `apps/web/cypress/component/answer-injection.cy.tsx` |
| The gate makes no request without a key | `apps/web/src/features/access/access-gate.test.tsx`  |
| The boot line, and the key not in it    | `apps/api/src/config/describe-guards.spec.ts`        |

→ [Spec: guarding a public demo](./specs/public-demo-guardrails.md).
