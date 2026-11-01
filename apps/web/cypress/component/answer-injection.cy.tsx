import { Answer } from '@/features/chat/answer';

/** A citation the answer can resolve, so the markers render as chips. */
const citations = [
  {
    n: 1,
    chunkId: 'c1',
    documentId: 'd1',
    documentTitle: 'lumen-billing',
    headingPath: 'Refunds',
    pageStart: null,
    pageEnd: null,
    snippet: 'A refund is issued against the original payment method.',
  },
];

describe('an answer quoting a hostile document', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      delete (win as unknown as Record<string, unknown>).XSS_FROM_DOCUMENT;
    });
  });

  it('AC19: renders a script tag from a document as text, not as an element', () => {
    cy.mountWithProviders(
      <Answer
        text={
          'The runbook says:\n\n<script>globalThis.XSS_FROM_DOCUMENT = true;</script>\n\nThat is all [1].'
        }
        citations={citations}
        onCite={() => undefined}
      />,
    );

    // The marker is never set, because the tag never became an element.
    cy.window().should((win) => {
      expect((win as unknown as Record<string, unknown>).XSS_FROM_DOCUMENT).to.equal(undefined);
    });
    cy.get('[data-cy-root] script').should('not.exist');
  });

  it('AC19: does not run an inline handler smuggled through an image tag', () => {
    cy.mountWithProviders(
      <Answer
        text={'Here is the diagram: <img src=x onerror="globalThis.XSS_FROM_DOCUMENT = true"> [1].'}
        citations={citations}
        onCite={() => undefined}
      />,
    );

    // `onerror` fires asynchronously if the element exists at all, so the
    // assertion waits rather than checking the same tick.
    cy.wait(250);
    cy.window().should((win) => {
      expect((win as unknown as Record<string, unknown>).XSS_FROM_DOCUMENT).to.equal(undefined);
    });
    cy.get('[data-cy-root] img').should('not.exist');
  });

  it('AC19: drops the tags and keeps their contents as plain text', () => {
    cy.mountWithProviders(
      <Answer
        text={'It says <script>alert(1)</script> here.'}
        citations={[]}
        onCite={() => undefined}
      />,
    );

    /*
     * The tags are removed rather than escaped and shown. Without
     * `rehype-raw` the parser produces `html` nodes and the renderer skips
     * them, so what survives is the text that sat between them.
     *
     * Safe, which is what AC19 is about: no element is created, so nothing
     * runs. Worth writing down that it is also lossy - a reader sees
     * `alert(1)` with nothing saying it arrived wrapped in a script tag.
     * Showing that would mean escaping rather than skipping, and skipping is
     * the behaviour that is safe when someone later adds a plugin.
     */
    cy.get('[data-cy-root]').should('have.text', 'It says alert(1) here.');
    cy.get('[data-cy-root] script').should('not.exist');
  });

  it('AC19: does not follow a javascript: link out of a document', () => {
    cy.mountWithProviders(
      <Answer
        text={'See [the runbook](javascript:globalThis.XSS_FROM_DOCUMENT=true).'}
        citations={[]}
        onCite={() => undefined}
      />,
    );

    cy.get('[data-cy-root] a').each(($anchor) => {
      expect($anchor.attr('href') ?? '').not.to.match(/^javascript:/i);
    });
  });

  it('still renders ordinary markdown and its citation chips', () => {
    cy.mountWithProviders(
      <Answer
        text={'Refunds take **five working days** [1].'}
        citations={citations}
        onCite={() => undefined}
      />,
    );

    cy.get('[data-cy-root] strong').should('contain.text', 'five working days');
    cy.contains('button', '1').should('exist');
  });
});
