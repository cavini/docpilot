# 0014. Tailwind with CSS-defined tokens

- **Status:** accepted
- **Date:** 2026-10-31

## Context

The project needs one visual language across three places that render the same
components: the Next.js app, Storybook, and Cypress component tests. Whatever is
chosen has to work in all three without each defining its own copy of the
palette.

## Decision

**Tailwind 4**, with the theme defined in **CSS** in `packages/ui` rather than
in a JavaScript config.

Tailwind 4 reads its theme from `@theme { … }` custom properties, so the design
tokens are ordinary CSS. The app, Storybook and a component test all import the
same stylesheet, and `bg-surface` compiles against the same value in each.

Colours are in `oklch`, which is perceptually uniform: two tokens with the same
lightness look equally light, so changing a hue does not quietly change
contrast.

## Why not CSS-in-JS

**It costs runtime work to produce something static.** A class name computed
during render, for a value that never changes, is work on every render to arrive
at the same string.

**Server components make it awkward.** The ecosystem's answers to React Server
Components range from "supported with caveats" to "not yet", and the caveats
change between releases. Styling is not where this project should be spending
its compatibility budget.

**Tailwind's real advantage is the constraint**, not the terseness. A spacing
scale with eight values produces consistent layout because there is nothing else
to reach for. A styled-component accepts any number of pixels, and a codebase
ends up with seven slightly different gaps.

What is given up is real: a long `className` is harder to read than a named
style, and a component with many conditional variants gets ugly fast. The answer
used here is that variants live in a lookup object at the top of the component —
`VARIANT`, `SIZE`, `TONE` — so the conditional logic is a table rather than
string concatenation.

## Why not CSS Modules

Closest alternative, and genuinely fine. It would mean a file per component and
inventing a naming convention for the scale — which is Tailwind, rebuilt by hand
and without the constraint. Rejected for that reason rather than for any fault.

## Consequences

- One palette, defined once, rendered identically by the app, Storybook and
  component tests.
- Dark mode is a media query redefining tokens; no component knows about it.
- Perceptually uniform colours make contrast predictable — but **not
  automatic**. The first version of the dark theme redefined surface, content
  and accent and left the status colours alone, so a danger badge measured
  3.54:1 at 12px against the 4.5:1 WCAG AA requires. Caught by axe on a
  Storybook story, which is why axe runs on every story rather than on the
  finished page.
- Markup carries styling, so a diff shows a visual change as a code change.
- A reader unfamiliar with Tailwind has a utility vocabulary to learn before a
  component reads easily.
