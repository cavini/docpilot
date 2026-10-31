import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '../button/button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Primitives/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: {
    title: 'No documents yet',
    description: 'Add a PDF, Markdown or text file and it becomes searchable in a few seconds.',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = { args: { description: undefined } };

export const WithAction: Story = {
  args: { action: <Button onClick={fn()}>Add a document</Button> },
};

export const Translated: Story = {
  args: {
    title: 'Nenhum documento ainda',
    description: 'Envie um PDF, Markdown ou arquivo de texto e ele fica pesquisável em segundos.',
  },
};

export const ActionIsReachable: Story = {
  args: { action: <Button onClick={fn()}>Add a document</Button> },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Add a document' });

    await userEvent.click(button);
    await expect(button).toBeVisible();
  },
};
