import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type DocumentSummary } from './document.types';
import { DocumentRow } from './document-row';
import { renderWithProviders } from '@/test/render';

const base: DocumentSummary = {
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

/** Renders a row with the handlers stubbed. */
function render(overrides: Partial<DocumentSummary> = {}) {
  const onRetry = vi.fn();
  const onDelete = vi.fn();

  renderWithProviders(
    <ul>
      <DocumentRow document={{ ...base, ...overrides }} onRetry={onRetry} onDelete={onDelete} />
    </ul>,
  );

  return { onRetry, onDelete };
}

describe('DocumentRow', () => {
  it('AC7: shows the passage count once a document is ready', () => {
    render();

    expect(screen.getByText(/7 passages/)).toBeInTheDocument();
  });

  it('uses the singular for one passage', () => {
    // `${n} passage(s)` is how a localised interface ends up ungrammatical in
    // both languages at once.
    render({ chunkCount: 1 });

    expect(screen.getByText(/1 passage(?!s)/)).toBeInTheDocument();
  });

  it('shows the page count for a format that has pages', () => {
    render({ pageCount: 9 });

    expect(screen.getByText(/9 pages/)).toBeInTheDocument();
  });

  it('shows no page count for a format without pages', () => {
    render({ pageCount: null });

    expect(screen.queryByText(/pages/)).toBeNull();
  });

  it('AC6: shows a progress bar while ingestion is running', () => {
    render({ status: 'embedding', progress: 62, chunkCount: 0 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    expect(screen.getByText('Embedding')).toBeInTheDocument();
  });

  it('shows no progress bar once a document is ready', () => {
    render();

    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it("AC8: shows the server's own reason for a failure", () => {
    // Shown as received, not translated: a catalogue of every server message
    // in the client goes stale the moment the server rewords one.
    render({ status: 'failed', error: 'no text layer; the document needs OCR', chunkCount: 0 });

    expect(screen.getByText('no text layer; the document needs OCR')).toBeInTheDocument();
  });

  it('AC8: offers retry only for a failed document', () => {
    render({ status: 'failed', error: 'provider timeout', chunkCount: 0 });

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('does not offer retry for a ready document', () => {
    render();

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('AC9: calls the retry handler', async () => {
    const { onRetry } = render({ status: 'failed', error: 'timeout', chunkCount: 0 });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledWith(base.id);
  });

  it('AC10: asks before deleting, rather than deleting on the first press', async () => {
    const { onDelete } = render();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete this document and its passages\?/)).toBeInTheDocument();
  });

  it('AC10: deletes once confirmed', async () => {
    const { onDelete } = render();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // The first Delete is replaced by the confirmation, so there is never
    // more than one button with this name at a time.
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(base.id);
  });

  it('AC10: replaces the delete button rather than showing two at once', async () => {
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('AC10: can be backed out of', async () => {
    const { onDelete } = render();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Delete this document and its passages\?/)).toBeNull();
  });

  it('shows the detected language', () => {
    render({ language: 'portuguese' });

    expect(screen.getByText('Portuguese')).toBeInTheDocument();
  });

  it('shows no language while it is still unknown', () => {
    render({ status: 'queued', language: null, chunkCount: 0 });

    expect(screen.queryByText('English')).toBeNull();
    expect(screen.queryByText('Portuguese')).toBeNull();
  });
});
