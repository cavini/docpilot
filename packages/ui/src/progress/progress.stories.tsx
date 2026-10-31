import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Progress } from './progress';

const meta = {
  title: 'Primitives/Progress',
  component: Progress,
  parameters: { layout: 'padded' },
  args: { value: 42, label: 'Ingesting handbook.pdf', children: '42%' },
  tags: ['autodocs'],
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Midway: Story = {};

export const Queued: Story = { args: { value: 0, children: '0%' } };

export const Complete: Story = { args: { value: 100, children: '100%' } };

export const Failed: Story = { args: { value: 60, failed: true, children: 'Failed' } };

export const WithoutText: Story = { args: { children: undefined } };

/** A processor reporting a value out of range must not take the page down. */
export const OutOfRangeIsClamped: Story = {
  args: { value: 1_000 },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('progressbar');

    await expect(bar).toHaveAttribute('aria-valuenow', '100');
  },
};

export const NegativeIsClamped: Story = {
  args: { value: -20 },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('progressbar');

    await expect(bar).toHaveAttribute('aria-valuenow', '0');
  },
};

/** The bar is announced by what it is doing, not as an unlabelled widget. */
export const IsAnnouncedByLabel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('progressbar', { name: 'Ingesting handbook.pdf' })).toBeVisible();
  },
};
