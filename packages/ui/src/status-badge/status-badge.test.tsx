import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders its label as text, so colour is never the only signal', () => {
    render(<StatusBadge tone="danger">Failed</StatusBadge>);

    expect(screen.getByText('Failed')).toBeVisible();
  });

  it.each(['neutral', 'progress', 'ok', 'warn', 'danger'] as const)(
    'renders the %s tone with the label still readable',
    (tone) => {
      render(<StatusBadge tone={tone}>Ready</StatusBadge>);

      expect(screen.getByText('Ready')).toBeVisible();
    },
  );
});
