import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Spinner } from './spinner';

const meta = {
  title: 'Primitives/Spinner',
  component: Spinner,
  parameters: { layout: 'centered' },
  args: { label: 'Loading documents' },
  tags: ['autodocs'],
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The label is announced but not shown.
 *
 * Asserted on the live region's *content*, not its accessible name:
 * `role="status"` does not take its name from its contents, so a name
 * assertion passes vacuously or fails misleadingly. What a screen reader
 * announces here is the text inside the region.
 */
export const LabelIsAnnouncedNotShown: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('status')).toHaveTextContent('Loading documents');
    // `sr-only` keeps it out of the visual layout while leaving it readable.
    await expect(canvas.getByText('Loading documents')).toHaveClass('sr-only');
  },
};
