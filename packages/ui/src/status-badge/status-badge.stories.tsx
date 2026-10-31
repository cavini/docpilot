import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { StatusBadge } from './status-badge';

const meta = {
  title: 'Primitives/StatusBadge',
  component: StatusBadge,
  parameters: { layout: 'centered' },
  args: { children: 'Ready', tone: 'ok' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['neutral', 'progress', 'ok', 'warn', 'danger'] },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Queued: Story = { args: { tone: 'neutral', children: 'Queued' } };

export const Embedding: Story = { args: { tone: 'progress', children: 'Embedding' } };

export const Warning: Story = { args: { tone: 'warn', children: 'No text layer' } };

export const Failed: Story = { args: { tone: 'danger', children: 'Failed' } };

export const Translated: Story = { args: { tone: 'progress', children: 'Processando' } };

/** Colour is never the only signal: the word is readable in every tone. */
export const WordIsAlwaysPresent: Story = {
  args: { tone: 'danger', children: 'Failed' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Failed')).toBeVisible();
  },
};
