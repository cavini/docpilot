import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from './progress';

describe('Progress', () => {
  it('exposes the value through the three ARIA attributes a progressbar needs', () => {
    render(<Progress value={42} label="Ingesting" />);

    const bar = screen.getByRole('progressbar', { name: 'Ingesting' });

    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps a value above 100 rather than throwing', () => {
    // A processor reporting 103% is a bug worth logging, not a reason to take
    // the page down while someone watches their upload.
    render(<Progress value={103} label="Ingesting" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps a negative value', () => {
    render(<Progress value={-5} label="Ingesting" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('rounds a fractional value, because a screen reader reads it aloud', () => {
    render(<Progress value={41.6} label="Ingesting" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('shows accompanying text when given it', () => {
    render(
      <Progress value={42} label="Ingesting">
        42%
      </Progress>,
    );

    expect(screen.getByText('42%')).toBeVisible();
  });

  it('omits the text element entirely when there is none', () => {
    const { container } = render(<Progress value={42} label="Ingesting" />);

    expect(container.querySelector('span')).toBeNull();
  });
});
