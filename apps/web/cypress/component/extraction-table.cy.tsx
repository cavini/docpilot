import { type SchemaField } from '@docpilot/shared';
import { useEffect, useState, type ReactNode } from 'react';

import { ExtractionTable } from '@/features/extraction/extraction-table';

const fields: SchemaField[] = [
  { name: 'method', kind: 'enum', label: 'Method', options: ['GET', 'POST'] },
  { name: 'path', kind: 'string', label: 'Path' },
  { name: 'summary', kind: 'text', label: 'Summary' },
  { name: 'authenticated', kind: 'boolean', label: 'Auth' },
];

const arriving = [
  { method: 'POST', path: '/auth/token', summary: 'Exchange credentials.', authenticated: false },
  { method: 'GET', path: '/invoices', summary: 'List invoices.', authenticated: true },
  { method: 'GET', path: '/invoices/{id}', summary: 'One invoice.', authenticated: true },
];

/**
 * Appends one item every `everyMs`, which is what the hook does to this
 * component when the server sends an `item` event.
 *
 * The table is driven by its props, so a harness that moves the props the way
 * the stream does exercises exactly the behaviour AC13 is about, in a real
 * browser, without pretending to test the network.
 */
function Arriving({ everyMs }: { everyMs: number }): ReactNode {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setItems((seen) =>
        seen.length === arriving.length ? seen : arriving.slice(0, seen.length + 1),
      );
    }, everyMs);

    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);

  return (
    <ExtractionTable fields={fields} items={items} streaming={items.length < arriving.length} />
  );
}

describe('ExtractionTable in a real browser', () => {
  it('AC13: fills a row at a time rather than appearing at the end', () => {
    cy.mountWithProviders(<Arriving everyMs={250} />);

    // The point of the criterion: rows are readable while more are still
    // coming. Asserting only the final count would pass just as happily if
    // every row appeared at once at the end.
    cy.get('tbody tr').should('have.length', 1);
    cy.contains('td', '/auth/token').should('be.visible');

    cy.get('tbody tr').should('have.length', 2);
    cy.contains('td', '/invoices').should('be.visible');

    cy.get('tbody tr').should('have.length', 3);
  });

  it('AC13: a row that has arrived is not re-created when the next one does', () => {
    cy.mountWithProviders(<Arriving everyMs={250} />);

    // A remount would reset scroll and selection and drop focus mid-stream,
    // which is the failure the keying is there to prevent. Marking the node
    // and looking for the mark later detects it; counting rows does not.
    cy.get('tbody tr')
      .should('have.length', 1)
      .first()
      .then(($first) => {
        $first.attr('data-first-row', 'marked');
      });

    cy.get('tbody tr').should('have.length', 3);
    cy.get('tbody tr').first().should('have.attr', 'data-first-row', 'marked');
  });

  it('AC13: says it is working before the first row arrives', () => {
    cy.mountWithProviders(<ExtractionTable fields={fields} items={[]} streaming />);

    cy.contains('Extracting').should('be.visible');
    cy.get('table').should('not.exist');
  });

  it('shows the empty state when nothing is streaming and nothing arrived', () => {
    cy.mountWithProviders(<ExtractionTable fields={fields} items={[]} streaming={false} />);

    cy.contains('Nothing extracted yet').should('be.visible');
    cy.contains('Extracting').should('not.exist');
  });

  it('heads each column from the schema the server published', () => {
    cy.mountWithProviders(<ExtractionTable fields={fields} items={arriving} streaming={false} />);

    cy.get('thead th').should('have.length', 4);
    cy.get('thead th').eq(0).should('have.text', 'Method');
    cy.get('thead th').eq(3).should('have.text', 'Auth');
  });

  it('renders a value the schema did not get as a gap, not as blank', () => {
    cy.mountWithProviders(
      <ExtractionTable
        fields={fields}
        items={[{ method: 'GET', path: '/ping' }]}
        streaming={false}
      />,
    );

    cy.get('tbody tr td').eq(2).should('have.text', '—');
  });

  it('renders an object in a string column as JSON rather than [object Object]', () => {
    cy.mountWithProviders(
      <ExtractionTable
        fields={fields}
        items={[
          { method: 'GET', path: { href: '/ping' }, summary: 'Health.', authenticated: false },
        ]}
        streaming={false}
      />,
    );

    cy.get('tbody tr td').eq(1).should('have.text', '{"href":"/ping"}');
    cy.contains('[object Object]').should('not.exist');
  });

  it('keeps a wide table inside its own scroller instead of widening the page', () => {
    // An unbroken path has no wrap opportunity, so it sets the column's
    // minimum width and the table genuinely cannot shrink to the viewport.
    // Short content fits at any width and would prove nothing.
    const wide = [
      {
        method: 'GET',
        path: '/workspaces/{workspaceId}/projects/{projectId}/invoices/{invoiceId}/line-items',
        summary: 'Every line on one invoice.',
        authenticated: true,
      },
    ];

    cy.viewport(420, 600);
    cy.mountWithProviders(<ExtractionTable fields={fields} items={wide} streaming={false} />);

    cy.get('table')
      .parent()
      .should(($scroller) => {
        const scroller = $scroller.get(0);

        expect(scroller.scrollWidth, 'the table overflows its scroller').to.be.greaterThan(
          scroller.clientWidth,
        );
      });

    // The one layout failure that makes everything else unusable: the
    // overflow must stay in the scroller rather than reaching the page.
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, 'the page does not scroll sideways').to.be.at.most(
        doc.documentElement.clientWidth,
      );
    });
  });
});
