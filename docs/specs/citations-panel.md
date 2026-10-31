# Spec: Citations panel

Status: implemented Milestone: M3

## Problem and goal

An answer with `[1]` in the text is only as useful as the reader's ability to
check it. If the marker is decoration, the citation is worse than nothing — it
looks like evidence while providing none.

The goal is that every marker is a control: press it, see the passage it came
from, with enough context to judge whether the answer is fair to it.

## Behaviour

**Markers become chips.** `[1]` in the streamed text renders as a small
pressable chip. A marker whose citation was not sent does not render as a chip —
and should never occur, because the server strips invalid markers before
sending, so a chip with no target is a bug worth seeing rather than hiding.

**The panel.** Pressing a chip opens a side panel showing that citation first:
document title, heading path or page range, and the passage. The other citations
for the same answer are listed below it, so the reader can see what else the
answer rested on.

**The passage is the chunk's own text,** not the heading-prefixed version used
for embedding. Showing the embedding text would display something the document
does not actually say.

**Closing.** Escape, the close button, or a click outside. Focus returns to the
chip that opened it, because a panel that strands keyboard focus is unusable
without a mouse.

**An answer with no citations** shows no chips and no panel affordance — the
refusal case, where there is genuinely nothing to show.

## API contract

Nothing new. Citations arrive as the `data-citations` part defined in
[`streaming-chat.md`](./streaming-chat.md), and are stored with the message so a
resumed conversation has them.

## Acceptance criteria

**AC1.** Given an answer containing `[1]`, when it renders, then the marker is a
pressable chip rather than literal text.

**AC2.** Given a chip, when it is pressed, then the panel opens showing that
citation's passage.

**AC3.** Given an answer with several citations, when the panel is open, then
the others are listed too.

**AC4.** Given a citation with a heading path, when it renders, then the heading
path is shown.

**AC5.** Given a citation with a page range, when it renders, then the pages are
shown.

**AC6.** Given a citation with neither, when it renders, then the document title
alone is shown, with no empty label.

**AC7.** Given the panel is open, when Escape is pressed, then it closes and
focus returns to the chip that opened it.

**AC8.** Given an answer with no citations, when it renders, then no chip and no
panel affordance appear.

**AC9.** Given the same number cited twice in one answer, when it renders, then
both markers are chips and both open the same citation.

**AC10.** Given a citation, when its passage renders, then it is the chunk's own
text, with no heading prefix.

**AC11.** Given markdown in an answer, when it renders, then it is sanitised: no
raw HTML, no script, and links carry `rel="noopener noreferrer"`.

**AC12.** Given a fenced code block in an answer, when it renders, then it is
highlighted and a marker-like `[1]` inside it is **not** turned into a chip.

**AC13.** Given the panel, when axe runs against it, then there are no
violations.

**AC14.** Given the page in pt-BR, when the panel renders, then its labels are
localised.

## Edge cases and failure modes

| Situation                                            | Behaviour                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Citation whose document was deleted mid-conversation | The stored snippet is still shown, with a note that the document is gone |
| Passage longer than the panel                        | Scrolls inside the panel; the page does not scroll horizontally          |
| Chip pressed while the answer is still streaming     | Opens immediately — citations arrive before the text                     |
| Marker in the text with no matching citation         | Rendered as plain text, and logged as a client-side warning              |

## Non-goals

- Highlighting the exact sentence inside the passage.
- Linking to a position in the original PDF.
- Showing the surrounding chunks for more context.
- A full document reader.

## Test plan

| AC             | Level               | File                                                   |
| -------------- | ------------------- | ------------------------------------------------------ |
| AC1, AC9, AC12 | unit                | `apps/web/src/features/chat/render-citations.test.tsx` |
| AC10, AC11     | unit                | `apps/web/src/features/chat/markdown.test.tsx`         |
| AC4–AC6, AC8   | component (RTL)     | `apps/web/src/features/chat/citation-panel.test.tsx`   |
| AC2, AC3, AC7  | component (browser) | `apps/web/cypress/component/citation-panel.cy.tsx`     |
| all states     | Storybook           | `packages/ui/src/citation-chip/*.stories.tsx`          |
| AC13, AC14     | browser e2e         | `apps/web/e2e/chat.spec.ts`                            |

AC7 is a browser test on purpose. Focus restoration cannot be verified in jsdom
with any confidence, and it is the criterion most likely to regress silently.

## Open questions

None.
