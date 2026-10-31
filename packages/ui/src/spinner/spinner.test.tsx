import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('announces what is loading through a live region', () => {
    render(<Spinner label="Loading documents" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading documents');
  });

  it('keeps the label out of the visual layout', () => {
    render(<Spinner label="Loading documents" />);

    expect(screen.getByText('Loading documents')).toHaveClass('sr-only');
  });

  it('hides the spinning decoration from assistive technology', () => {
    const { container } = render(<Spinner label="Loading" />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
