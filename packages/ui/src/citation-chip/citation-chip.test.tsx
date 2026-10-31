import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CitationChip } from './citation-chip';

describe('CitationChip', () => {
  it('AC1: is a real button, so it is focusable and announced as one', () => {
    render(<CitationChip n={1} source="Lumen API" />);

    expect(screen.getByRole('button')).toBeInstanceOf(HTMLButtonElement);
  });

  it('names the source in its accessible name, not just the number', () => {
    // "1" alone tells a screen reader user nothing about what they will open.
    render(<CitationChip n={1} source="Lumen API" />);

    expect(screen.getByRole('button', { name: 'Source 1: Lumen API' })).toBeVisible();
  });

  it('shows the number as its visible label', () => {
    render(<CitationChip n={7} source="Lumen API" />);

    expect(screen.getByRole('button')).toHaveTextContent('7');
  });

  it('calls the handler on click', async () => {
    const onClick = vi.fn();
    render(<CitationChip n={1} source="Lumen API" onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates from the keyboard', async () => {
    const onClick = vi.fn();
    render(<CitationChip n={1} source="Lumen API" onClick={onClick} />);

    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button", so it cannot submit the question form', () => {
    render(<CitationChip n={1} source="Lumen API" />);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
