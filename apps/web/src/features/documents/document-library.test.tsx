import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DocumentSummary } from './document.types';
import { DocumentLibrary } from './document-library';
import { renderWithProviders } from '@/test/render';

const ready: DocumentSummary = {
  id: '7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b',
  title: 'lumen-api',
  sourceFilename: 'lumen-api.md',
  mimeType: 'text/markdown',
  sizeBytes: 4_200,
  status: 'ready',
  progress: 100,
  language: 'english',
  error: null,
  pageCount: null,
  chunkCount: 7,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:30.000Z',
};

/** One queued response per request, in order, so a sequence can be scripted. */
function mockFetch(responses: (Response | Error)[]): ReturnType<typeof vi.fn> {
  const queue = [...responses];
  const fetchMock = vi.fn(() => {
    const next = queue.length > 1 ? queue.shift() : queue[0];

    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next!.clone());
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/** Builds a JSON response. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DocumentLibrary', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC1: explains how to start, rather than showing an empty list', async () => {
    mockFetch([json({ items: [], nextCursor: null })]);
    renderWithProviders(<DocumentLibrary />);

    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByText(/Add a PDF, Markdown or text file/)).toBeInTheDocument();
  });

  it('lists what is already held', async () => {
    mockFetch([json({ items: [ready], nextCursor: null })]);
    renderWithProviders(<DocumentLibrary />);

    expect(await screen.findByText('lumen-api')).toBeInTheDocument();
    expect(screen.queryByText('No documents yet')).toBeNull();
  });

  it('AC12: says the API is unreachable instead of showing an empty library', async () => {
    // Showing "no documents yet" when the API is down tells the reader their
    // corpus is gone, which is both wrong and alarming.
    mockFetch([new Error('network down')]);
    renderWithProviders(<DocumentLibrary />);

    expect(await screen.findByText('The API is not reachable')).toBeInTheDocument();
    expect(screen.queryByText('No documents yet')).toBeNull();
  });

  it('AC12: offers a retry that refetches', async () => {
    const fetchMock = mockFetch([new Error('network down')]);
    renderWithProviders(<DocumentLibrary />);

    await screen.findByText('The API is not reachable');
    const before = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('AC4: refuses an unsupported dropped file without making a request', async () => {
    // Dropped, not chosen. The file picker already filters by the input's
    // `accept`, so a `.docx` can never arrive that way — which is exactly why
    // the check in `validate-file` exists: a drop bypasses `accept` entirely
    // and hands the page whatever was dragged onto it.
    const fetchMock = mockFetch([json({ items: [], nextCursor: null })]);
    renderWithProviders(<DocumentLibrary />);
    await screen.findByText('No documents yet');
    const before = fetchMock.mock.calls.length;

    fireEvent.drop(screen.getByText('Drop a document here, or choose one'), {
      dataTransfer: {
        files: [new File(['x'], 'report.docx', { type: 'application/vnd.openxmlformats' })],
      },
    });

    expect(
      await screen.findByText('report.docx is not a PDF, Markdown or text file.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it('AC5: refuses a dropped file over the limit, naming the limit', async () => {
    mockFetch([json({ items: [], nextCursor: null })]);
    renderWithProviders(<DocumentLibrary />);
    await screen.findByText('No documents yet');

    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });

    fireEvent.drop(screen.getByText('Drop a document here, or choose one'), {
      dataTransfer: { files: [big] },
    });

    expect(await screen.findByText(/huge\.pdf is larger than the 20 MB limit/)).toBeInTheDocument();
  });

  it('AC2: uploads an accepted file', async () => {
    const fetchMock = mockFetch([
      json({ items: [], nextCursor: null }),
      json(ready, 201),
      json({ items: [ready], nextCursor: null }),
    ]);
    renderWithProviders(<DocumentLibrary />);
    await screen.findByText('No documents yet');

    await userEvent.upload(
      screen.getByLabelText('Choose a document to upload'),
      new File(['# Guide'], 'lumen-api.md', { type: 'text/markdown' }),
    );

    await waitFor(() => {
      const posted = fetchMock.mock.calls.some(([input, init]) => {
        const method =
          (init as RequestInit | undefined)?.method ??
          (input instanceof Request ? input.method : undefined);

        return method?.toUpperCase() === 'POST';
      });

      expect(posted).toBe(true);
    });
  });

  it('AC11: says so when the bytes were already held, rather than appearing to do nothing', async () => {
    mockFetch([
      json({ items: [], nextCursor: null }),
      json(ready, 200),
      json({ items: [ready], nextCursor: null }),
    ]);
    renderWithProviders(<DocumentLibrary />);
    await screen.findByText('No documents yet');

    await userEvent.upload(
      screen.getByLabelText('Choose a document to upload'),
      new File(['# Guide'], 'lumen-api.md', { type: 'text/markdown' }),
    );

    expect(await screen.findByText(/lumen-api\.md was already in the corpus/)).toBeInTheDocument();
  });

  it('reports an upload that failed', async () => {
    mockFetch([
      json({ items: [], nextCursor: null }),
      json({ error: { code: 'payload_too_large', message: 'too big', requestId: 'r1' } }, 413),
      json({ items: [], nextCursor: null }),
    ]);
    renderWithProviders(<DocumentLibrary />);
    await screen.findByText('No documents yet');

    await userEvent.upload(
      screen.getByLabelText('Choose a document to upload'),
      new File(['# Guide'], 'lumen-api.md', { type: 'text/markdown' }),
    );

    expect(await screen.findByText(/could not be uploaded/)).toBeInTheDocument();
  });
});
