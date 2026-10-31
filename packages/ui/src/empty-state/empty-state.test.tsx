import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('shows the title', () => {
    render(<EmptyState title="No documents yet" />);

    expect(screen.getByText('No documents yet')).toBeVisible();
  });

  it('shows the description when given one', () => {
    render(<EmptyState title="No documents yet" description="Add a PDF to start" />);

    expect(screen.getByText('Add a PDF to start')).toBeVisible();
  });

  it('renders no description element when there is none', () => {
    const { container } = render(<EmptyState title="Empty" />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders an action when given one', () => {
    render(<EmptyState title="Empty" action={<button type="button">Add</button>} />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  });
});
