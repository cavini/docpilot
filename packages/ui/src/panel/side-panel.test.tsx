import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SidePanel } from './side-panel';

const props = { title: 'Sources', closeLabel: 'Close sources' };

describe('SidePanel', () => {
  it('renders nothing when closed, so its contents leave the tab order', () => {
    // A visually hidden panel that stays mounted traps a keyboard user in
    // invisible controls, which is how most dialogs become unusable.
    render(
      <SidePanel {...props} open={false} onClose={vi.fn()}>
        <button type="button">Inside</button>
      </SidePanel>,
    );

    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull();
  });

  it('renders its contents when open', () => {
    render(
      <SidePanel {...props} open onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    expect(screen.getByText('A passage')).toBeVisible();
  });

  it('takes its accessible name from the title', () => {
    render(
      <SidePanel {...props} open onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    expect(screen.getByRole('dialog', { name: 'Sources' })).toBeVisible();
  });

  it('AC7: closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <SidePanel {...props} open onClose={onClose}>
        <p>A passage</p>
      </SidePanel>,
    );

    screen.getByRole('dialog').focus();
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', async () => {
    const onClose = vi.fn();
    render(
      <SidePanel {...props} open onClose={onClose}>
        <p>A passage</p>
      </SidePanel>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close sources' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the panel when it opens', () => {
    const { rerender } = render(
      <SidePanel {...props} open={false} onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    rerender(
      <SidePanel {...props} open onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('AC7: returns focus to whatever opened it', () => {
    render(<button type="button">Opener</button>);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();

    const panel = render(
      <SidePanel {...props} open onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    panel.unmount();

    expect(opener).toHaveFocus();
  });

  it('leaves the page behind usable, because the reader is comparing the two', () => {
    render(
      <SidePanel {...props} open onClose={vi.fn()}>
        <p>A passage</p>
      </SidePanel>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
  });
});
