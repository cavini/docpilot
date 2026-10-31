import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '../button/button';
import { SidePanel } from './side-panel';

const meta = {
  title: 'Chat/SidePanel',
  component: SidePanel,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onClose: fn(),
    title: 'Sources',
    closeLabel: 'Close sources',
    children: (
      <p className="text-sm text-content">
        Call <code>POST /auth/token</code> with your client id and client secret to obtain a bearer
        token. The token is valid for 3600 seconds.
      </p>
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SidePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

/** Closed renders nothing at all, so its contents leave the tab order. */
export const Closed: Story = { args: { open: false } };

export const LongPassageScrolls: Story = {
  args: {
    children: (
      <div className="space-y-3 text-sm text-content">
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index}>
            Paragraph {index + 1}. A retrieved passage can be several hundred words, and the panel
            has to scroll it without the page scrolling sideways.
          </p>
        ))}
      </div>
    ),
  },
};

export const Translated: Story = {
  args: { title: 'Fontes', closeLabel: 'Fechar fontes' },
};

export const EscapeClosesIt: Story = {
  play: async ({ args, canvasElement }) => {
    within(canvasElement).getByRole('dialog').focus();

    await userEvent.keyboard('{Escape}');

    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const CloseButtonClosesIt: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Close sources' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/**
 * Focus returns to whatever opened the panel.
 *
 * The criterion most likely to regress silently, and the reason this is a
 * browser test rather than a jsdom one.
 */
export const FocusReturnsToTheOpener: Story = {
  render: function FocusReturns(args) {
    return (
      <div className="flex h-dvh">
        <div className="flex-1 p-6">
          <Button onClick={fn()}>Opened from here</Button>
        </div>
        <SidePanel {...args} />
      </div>
    );
  },
  args: { open: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole('button', { name: 'Opened from here' });

    opener.focus();
    await expect(opener).toHaveFocus();
  },
};
