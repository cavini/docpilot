import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type Citation } from './citation.types';
import { CitationsPanel } from './citations-panel';
import { renderWithProviders } from '@/test/render';

const base: Citation = {
  n: 1,
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  documentTitle: 'lumen-api',
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  snippet: 'Call POST /auth/token with your client id and secret.',
};

const paged: Citation = {
  ...base,
  n: 2,
  chunkId: 'chunk-2',
  documentTitle: 'lumen-handbook',
  headingPath: null,
  pageStart: 9,
  pageEnd: 9,
  snippet: 'Quote the request id from the error response.',
};

describe('CitationsPanel', () => {
  it('AC2: shows the pressed citation', () => {
    renderWithProviders(<CitationsPanel citations={[base]} focused={1} onClose={vi.fn()} />);

    expect(screen.getByText('lumen-api')).toBeVisible();
    expect(screen.getByText(base.snippet)).toBeVisible();
  });

  it('AC3: lists the other citations too', () => {
    renderWithProviders(<CitationsPanel citations={[base, paged]} focused={1} onClose={vi.fn()} />);

    expect(screen.getByText('lumen-handbook')).toBeVisible();
  });

  it('puts the pressed citation first, whichever it was', () => {
    renderWithProviders(<CitationsPanel citations={[base, paged]} focused={2} onClose={vi.fn()} />);

    const titles = screen.getAllByText(/lumen-/).map((node) => node.textContent);

    expect(titles[0]).toBe('lumen-handbook');
  });

  it('AC4: shows the heading path when the format has one', () => {
    renderWithProviders(<CitationsPanel citations={[base]} focused={1} onClose={vi.fn()} />);

    expect(screen.getByText('Lumen API > Authentication')).toBeVisible();
  });

  it('AC5: shows a single page when the passage sits on one', () => {
    renderWithProviders(<CitationsPanel citations={[paged]} focused={2} onClose={vi.fn()} />);

    expect(screen.getByText('Page 9')).toBeVisible();
  });

  it('AC5: shows a page range when the passage spans several', () => {
    renderWithProviders(
      <CitationsPanel citations={[{ ...paged, pageEnd: 11 }]} focused={2} onClose={vi.fn()} />,
    );

    expect(screen.getByText('Pages 9–11')).toBeVisible();
  });

  it('AC6: shows the title alone when there is neither, with no empty label', () => {
    // An empty label beside the title reads as a rendering fault.
    const { container } = renderWithProviders(
      <CitationsPanel
        citations={[{ ...base, headingPath: null, pageStart: null, pageEnd: null }]}
        focused={1}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('lumen-api')).toBeVisible();
    expect(
      [...container.querySelectorAll('p')].some((node) => node.textContent.trim() === ''),
    ).toBe(false);
  });

  it('AC10: shows the passage text, not a heading-prefixed version', () => {
    renderWithProviders(<CitationsPanel citations={[base]} focused={1} onClose={vi.fn()} />);
    const passage = screen.getByText(base.snippet);

    expect(passage.textContent).toBe(base.snippet);
  });

  it('AC8: renders nothing when no citation is focused', () => {
    renderWithProviders(<CitationsPanel citations={[base]} focused={null} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('AC7: closes on Escape', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CitationsPanel citations={[base]} focused={1} onClose={onClose} />);

    screen.getByRole('dialog').focus();
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CitationsPanel citations={[base]} focused={1} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close sources' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
