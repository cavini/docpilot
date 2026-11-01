import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtractionView } from './extraction-view';
import { renderWithProviders } from '@/test/render';

const schemas = [
  {
    name: 'api_endpoints',
    title: 'API endpoints',
    description: 'Every HTTP endpoint the documents describe.',
    fields: [
      { name: 'method', kind: 'enum' as const, label: 'Method', options: ['GET', 'POST'] },
      { name: 'path', kind: 'string' as const, label: 'Path' },
      { name: 'summary', kind: 'text' as const, label: 'Summary' },
      { name: 'authenticated', kind: 'boolean' as const, label: 'Auth' },
    ],
  },
  {
    name: 'faq_pairs',
    title: 'Questions and answers',
    description: 'Question-and-answer pairs the documents already contain.',
    fields: [
      { name: 'question', kind: 'text' as const, label: 'Question' },
      { name: 'answer', kind: 'text' as const, label: 'Answer' },
    ],
  },
];

const citations = [
  { n: 1, chunkId: 'c1', documentId: 'd1', documentTitle: 'lumen-api', headingPath: 'Auth' },
];

/** One server-sent event, framed as the endpoint writes it. */
function event(part: unknown): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

/** A response whose body is a stream that releases one frame per read. */
function streamed(frames: string[], status = 200): Response {
  const queue = [...frames];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();

      if (next === undefined) {
        controller.close();

        return;
      }

      controller.enqueue(new TextEncoder().encode(next));
    },
  });

  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

/** A JSON response. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The URL a `fetch` call was made to, however it was addressed. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

/** The JSON body a `fetch` call carried. */
function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

/**
 * Answers `GET /extract/schemas` and `POST /extract/stream` by URL rather
 * than by call order, because the view fetches the schemas on mount and the
 * stream on click — the order of the two is the component's business, not the
 * test's.
 */
function stubFetch(options: {
  schemas?: Response | Error;
  stream?: () => Response | Error;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (urlOf(input).endsWith('/extract/schemas')) {
      const answer = options.schemas ?? json({ schemas });

      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone());
    }

    const answer = options.stream?.() ?? json({ error: { message: 'no stream stubbed' } }, 500);

    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

const threeRows = [
  event({ type: 'schema', schema: 'api_endpoints', citations }),
  event({
    type: 'item',
    item: { method: 'POST', path: '/auth/token', summary: 'Get a token.', authenticated: false },
  }),
  event({
    type: 'item',
    item: { method: 'GET', path: '/invoices', summary: 'List invoices.', authenticated: true },
  }),
  event({ type: 'done', dropped: 0 }),
  'data: [DONE]\n\n',
];

describe('ExtractionView', () => {
  beforeEach(() => {
    stubFetch({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('AC10: offers every shape the server published, named in the reader language', async () => {
    renderWithProviders(<ExtractionView />);

    const chooser = await screen.findByLabelText('Shape');

    expect(chooser).toHaveValue('api_endpoints');
    expect(screen.getByRole('option', { name: 'API endpoints' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Questions and answers' })).toBeInTheDocument();
  });

  it('AC13: appends each item as its event arrives', async () => {
    stubFetch({ stream: () => streamed(threeRows) });
    renderWithProviders(<ExtractionView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    expect(await screen.findByText('/auth/token')).toBeInTheDocument();
    expect(await screen.findByText('/invoices')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(3); // the heading row and two items
    });
  });

  it('AC8: names the documents the items were read from', async () => {
    stubFetch({ stream: () => streamed(threeRows) });
    renderWithProviders(<ExtractionView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    expect(await screen.findByText(/Read from 1 passage in lumen-api/)).toBeInTheDocument();
  });

  it('asks the server for the shape the reader chose', async () => {
    const fetchMock = stubFetch({ stream: () => streamed(threeRows) });
    renderWithProviders(<ExtractionView />);

    await userEvent.selectOptions(await screen.findByLabelText('Shape'), 'faq_pairs');
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        urlOf(url as RequestInfo | URL).endsWith('/extract/stream'),
      );

      expect(call).toBeDefined();
      expect(bodyOf(call?.[1] as RequestInit | undefined)).toEqual({ schema: 'faq_pairs' });
    });
  });

  it('clears the previous result when the shape changes', async () => {
    stubFetch({ stream: () => streamed(threeRows) });
    renderWithProviders(<ExtractionView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));
    expect(await screen.findByText('/auth/token')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Shape'), 'faq_pairs');

    // Rows from one shape under another shape's headings would be a table
    // that lies about what it is showing, so the result goes with the shape.
    expect(screen.queryByText('/auth/token')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing extracted yet')).toBeInTheDocument();
  });

  it('AC2: shows the server reason when the shape is refused', async () => {
    stubFetch({
      stream: () =>
        json({ error: { code: 'unknown_schema', message: 'No schema named "nope".' } }, 400),
    });
    renderWithProviders(<ExtractionView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    expect(await screen.findByText('No schema named "nope".')).toBeInTheDocument();
  });

  it('says plainly when the shapes could not be loaded', async () => {
    stubFetch({ schemas: json({}, 503) });
    renderWithProviders(<ExtractionView />);

    expect(await screen.findByText('The list of shapes could not be loaded.')).toBeInTheDocument();

    // Nothing to extract with, so nothing to press.
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
  });

  it('counts dropped items rather than hiding them', async () => {
    stubFetch({
      stream: () =>
        streamed([
          event({ type: 'schema', schema: 'api_endpoints', citations }),
          event({
            type: 'item',
            item: { method: 'GET', path: '/ping', summary: 'Health.', authenticated: false },
          }),
          event({ type: 'done', dropped: 2 }),
        ]),
    });
    renderWithProviders(<ExtractionView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    expect(await screen.findByText('2 items dropped')).toBeInTheDocument();
  });

  it('offers the download only once there is something to download', async () => {
    stubFetch({ stream: () => streamed(threeRows) });
    renderWithProviders(<ExtractionView />);

    await screen.findByLabelText('Shape');
    expect(screen.queryByRole('button', { name: 'Download JSON' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    expect(await screen.findByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
  });

  it('AC14: downloads the items with the shape and the passages they came from', async () => {
    stubFetch({ stream: () => streamed(threeRows) });

    let downloaded: Blob | undefined;
    let revoked: string | undefined;
    let downloadName: string | undefined;
    let href: string | undefined;

    // Only the two methods the view uses: `vi.unstubAllGlobals` puts the real
    // `URL` back afterwards, and nothing here constructs one.
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob): string => {
        downloaded = blob;

        return 'blob:docpilot/1';
      },
      revokeObjectURL: (url: string): void => {
        revoked = url;
      },
    });

    // jsdom does not navigate, so the click is caught and what the element
    // was carrying at that moment is what the assertions read. Reading it
    // here rather than keeping the element: the view revokes the blob URL
    // immediately afterwards, so `href` is only meaningful during the click.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
      href = this.href;
    });

    renderWithProviders(<ExtractionView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }));

    expect(downloadName).toBe('api_endpoints.json');
    expect(href).toBe('blob:docpilot/1');

    const saved: unknown = JSON.parse(await downloaded!.text());

    expect(saved).toMatchObject({
      schema: 'api_endpoints',
      items: [{ path: '/auth/token' }, { path: '/invoices' }],
      citations: [{ documentTitle: 'lumen-api' }],
    });

    // Kept alive only for the click: an unrevoked blob holds a second copy of
    // the data until the tab closes.
    expect(revoked).toBe('blob:docpilot/1');
  });

  it('swaps Extract for Stop while a run is in flight', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch({
      stream: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async pull(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  event({ type: 'schema', schema: 'api_endpoints', citations }),
                ),
              );
              await held;
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    renderWithProviders(<ExtractionView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    const stop = await screen.findByRole('button', { name: 'Stop' });

    expect(screen.queryByRole('button', { name: 'Extract' })).not.toBeInTheDocument();

    await userEvent.click(stop);

    // Stopping ends the run; it does not report a failure.
    expect(await screen.findByRole('button', { name: 'Extract' })).toBeInTheDocument();
    release?.();
  });
});
