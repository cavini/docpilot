# The web application

How the interface is put together, and why the state is split the way it is.

## The rule that shapes everything

**The web app talks only to the Nest API.** It has no database client, no model
client, no business logic. Every Next.js route is a page; none is an API route.
[ADR 0011](./adr/0011-nestjs-only-backend.md) records why, and it is what keeps
the backend's behaviour testable in one place rather than split across two
runtimes that have to be kept in step.

## Structure

```
apps/web/src/
  app/[locale]/        pages; locale is a route segment
  components/          shared, not tied to a feature
  features/
    documents/         upload, library, live progress
    chat/              conversation, answers, sources
    extraction/        schema chooser, the streaming table
  store/               the RTK Query client
  i18n/                routing, request config, message loading
```

Features own their own components, hooks, types and tests. A `features/` folder
that needs something from another feature is a sign the boundary is wrong — so
far none has.

The design system lives in `packages/ui` and is consumed as **source**, not as a
build output, so the app and Storybook render against exactly the same code and
token values.

## Two state owners, on purpose

| State                    | Owner     | Why                                                 |
| ------------------------ | --------- | --------------------------------------------------- |
| Documents, health, flags | RTK Query | Server state that is read, cached and invalidated   |
| The conversation         | `useChat` | Streaming message state, which a cache cannot model |

**Chat is deliberately not an RTK Query endpoint.** Two caches over the same
data would fight, and only one of them understands a message that is half
arrived. `useChat` holds the message list, the status (`ready`, `submitted`,
`streaming`, `error`) and the abort handle; RTK Query holds everything with a
request/response shape.

→ [ADR 0013](./adr/0013-state-management-rtk-query.md).

### Socket events patch the cache; they do not invalidate it

Ingestion progress arrives over the WebSocket and is written straight into the
cached document list with `updateQueryData`. Invalidating instead would refetch
the whole list on every progress tick — four or more requests per document — to
apply a change the event already carried.

Only documents still being ingested are subscribed to, so a corpus of a thousand
`ready` documents does not open a thousand subscriptions to be told nothing.

The socket is **optional by design**: if it never connects, statuses are still
correct on reload and every other part of the app works. A progress feed that
takes the page down when it drops is worse than no progress feed.

## The chat request is rewritten

The AI SDK's default transport posts the whole message array. This API takes the
new question and the conversation it belongs to, so `prepareSendMessagesRequest`
sends that instead.

That is not only a shape mismatch. The server holds the conversation; sending
the transcript back on every turn would let a client rewrite its own history,
which is exactly what a server-held conversation prevents.

The conversation id and the citations arrive as **data parts** in the stream
rather than as a header or a second request — see
[`api.md`](./api.md#post-chat).

## Rendering an answer

An answer is markdown, written by a model, from passages a user uploaded. Two
consequences:

**`rehypeSanitize` is not optional.** Raw HTML in an answer is reachable by
anyone who can upload a file. Links get `rel="noopener noreferrer"` and open in
a new tab.

**Code blocks are not scanned for citations.** `items[1]` in a sample is an
array index. The server masks fenced code the same way when it resolves
citations, and the two have to agree — a chip rendered over something the server
never treated as a citation would point at the wrong passage.

### A memoisation that is load-bearing

`react-markdown` keys its output by **component identity**. Rebuilding the
component map on every render gives every element a new type, so React unmounts
and remounts the entire answer whenever anything on the page changes.

The visible symptom was not slowness. Opening the sources panel re-rendered the
page, which remounted the answer, which replaced every citation chip with a new
DOM node — so restoring focus to "the chip that opened the panel" landed on an
element no longer in the document. The map is memoised, and the per-message
derived values live in `AssistantMessage` so the memo has stable inputs.

Found by a browser test asserting focus restoration. No unit test would have
caught it, because every unit test renders once.

## A table that fills as rows arrive

The extraction view reads `POST /extract/stream` with `fetch` and a reader, not
`EventSource` — `EventSource` is GET-only, and putting the schema and the
reader's query into a URL would put their query text into every access log
between here and there.

Rows are **appended, never replaced or reordered**, because the server only
sends completed items. That is what makes keying them by position safe, and it
is what keeps a row's DOM node alive when the next row lands. A remount
mid-stream would reset scroll and drop focus, which is the same class of bug as
the memoisation above, so there is a browser test that marks the first row's
element and checks the mark survives two more rows arriving.

The columns come from `GET /extract/schemas`, not from a list held here, so a
schema added on the server appears in the chooser and gets a table with no
front-end release.

Two decoding details that are silent when missed:

- `TextDecoder` is used with `{ stream: true }`: a multi-byte character can be
  split across two reads, and decoding each alone turns the `ã` in _visão_ into
  a replacement character.
- The buffer keeps whatever follows the last `\n\n`, because a frame can arrive
  in two pieces.

Both have a test that fails if the handling is removed.

Values go through a helper rather than `String()`. A field the schema says is a
string can arrive as an object, and `[object Object]` in a cell is a rendering
bug wearing a value's clothes — anything that is not a primitive is shown as
JSON instead, which is ugly and honest.

→ [`structured-output.md`](./structured-output.md).

## Internationalisation

English and Brazilian Portuguese, with the locale as a route segment (`/en`,
`/pt-BR`) rather than a cookie, so a link to a page is a link to a page in a
language.

**No user-visible string is a literal in a component** — including `aria-label`s
and the text a screen reader reads. Dates, file sizes and counts are formatted
by `Intl`, not assembled by hand: `1,2 MB` in pt-BR and `1.2 MB` in English,
with a real plural rule rather than `${n} document(s)`.

Four things are tested, because three of them pass a naive key-parity check
while still being broken:

- the catalogues have exactly the same keys;
- a translation has not dropped a `{placeholder}` the English one carries;
- no value is an empty string, which renders as a blank label;
- the catalogues are not identical, which is what a copied file looks like.

**Server messages are not translated.** An API error's `message` is shown as
received; the interface around it is localised. A catalogue of every server
message in the client goes stale the moment the server rewords one. What the
client branches on is the stable `code`.

→ [`specs/i18n.md`](./specs/i18n.md).

## Styling

Tailwind 4, with the theme defined in CSS in the design system rather than in a
JavaScript config — so `bg-surface` compiles against the same custom properties
in the app, in Storybook and in a Cypress component test.

Colours are in `oklch` because it is perceptually uniform: two tokens with the
same lightness look equally light, which keeps contrast predictable when a hue
changes. Dark mode follows the reader's system setting.

That did not save us from a contrast failure. The dark block redefined surface,
content and accent but left `ok`, `warn` and `danger` at their light values, so
a danger badge measured 3.54:1 against the dark surface at 12px — against the
4.5:1 WCAG AA requires. Caught by axe on a Storybook story, not by looking at
it.

→ [ADR 0014](./adr/0014-tailwind-over-css-in-js.md).

## Accessibility: what is actually asserted

Not a checklist — specific claims, each with a test:

| Claim                                                   | Where                                        |
| ------------------------------------------------------- | -------------------------------------------- |
| Every page has no axe violations                        | Playwright, per page and with the panel open |
| Every component state has no axe violations             | Storybook, per story                         |
| The dropzone works without a mouse                      | It is a real file input; asserted focusable  |
| A citation is reachable and activatable by keyboard     | It is a real button; asserted                |
| Escape closes the panel and returns focus to its opener | Playwright, in a real browser                |
| A closed panel leaves the tab order                     | Asserted it renders nothing                  |
| Status is readable, not only coloured                   | Asserted the word is present                 |
| A live region announces progress                        | Asserted by role and content                 |

Focus restoration is a browser test on purpose. jsdom cannot verify it with any
confidence, and it is the criterion most likely to regress silently — as it did.

## The client is not generated yet

The endpoints are declared by hand in `store/api.ts`. `openapi.json` is
committed and checked against a fresh regeneration in CI, so the contract cannot
drift from the server; generating the client from it is a change to make when
the surface is large enough that hand-writing it is the slower option.

What that would not change is the split above: a generated client covers the
request/response endpoints, and chat would still belong to `useChat`.

## What is tested where

| Level               | Tool                            | Covers                                                              |
| ------------------- | ------------------------------- | ------------------------------------------------------------------- |
| Unit                | Vitest + RTL                    | Pure functions, components with substituted data                    |
| Component (browser) | Cypress CT                      | Behaviour that needs real layout or focus                           |
| Component (states)  | Storybook + Vitest browser mode | Every state of a design-system component, both languages, with axe  |
| Browser end-to-end  | Playwright                      | Journeys across the page, with the API stubbed at the network layer |

The end-to-end suite stubs the API. The journey under test is the interface;
that the real API behaves that way is its own e2e and contract suites' job, and
stubbing keeps this deterministic, container-free and free.

One exception: the extraction stream. Playwright's interception can only answer
with a whole body, so a stubbed route would pass whether the table filled a row
at a time or all at once at the end — the criterion would be assumed rather than
tested. That endpoint is served by a small real server
(`e2e/support/extract-stub.mjs`) that writes one event per interval over a
socket, started as a second `webServer` in the Playwright config.

→ [`testing.md`](./testing.md).
