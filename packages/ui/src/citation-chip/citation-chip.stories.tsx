import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { CitationChip } from './citation-chip';

const meta = {
  title: 'Chat/CitationChip',
  component: CitationChip,
  parameters: { layout: 'centered' },
  args: { n: 1, source: 'Lumen API', onClick: fn() },
  tags: ['autodocs'],
} satisfies Meta<typeof CitationChip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const First: Story = {};

export const DoubleDigit: Story = { args: { n: 12, source: 'Lumen billing' } };

/** In context, where the chip has to sit on the text baseline. */
export const InRunningText: Story = {
  render: (args) => (
    <p className="max-w-prose text-sm leading-relaxed text-content">
      Exchange your client credentials for a bearer token at <code>POST /auth/token</code>
      <CitationChip {...args} /> and send it on every request. Tokens expire after an hour
      <CitationChip {...args} n={2} source="Lumen handbook" />.
    </p>
  ),
};

/** The accessible name names the source: "1" alone tells a reader nothing. */
export const NameIncludesTheSource: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button', { name: 'Source 1: Lumen API' })).toBeVisible();
  },
};

/** Reachable and activatable without a mouse, because it is a real button. */
export const ActivatesWithKeyboard: Story = {
  play: async ({ args, canvasElement }) => {
    const chip = within(canvasElement).getByRole('button');

    chip.focus();
    await expect(chip).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalled();
  },
};
