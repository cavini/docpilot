import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { MessageBubble } from './message-bubble';

const meta = {
  title: 'Chat/MessageBubble',
  component: MessageBubble,
  parameters: { layout: 'padded' },
  args: {
    author: 'assistant',
    authorLabel: 'DocPilot',
    children: 'Exchange your client credentials for a bearer token at POST /auth/token.',
  },
  argTypes: { author: { control: 'inline-radio', options: ['user', 'assistant'] } },
  tags: ['autodocs'],
} satisfies Meta<typeof MessageBubble>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Assistant: Story = {};

export const User: Story = {
  args: { author: 'user', authorLabel: 'You', children: 'How do I authenticate?' },
};

export const WithFooter: Story = {
  args: { footer: '1,842 in · 96 out · $0.000321' },
};

export const Stopped: Story = {
  args: {
    children: 'Exchange your client credentials for a bearer',
    footer: 'Stopped',
  },
};

export const LongAnswerWraps: Story = {
  args: {
    children: Array.from(
      { length: 4 },
      () =>
        'A long answer has to wrap inside a bounded width rather than stretching across a wide screen, because a line of text beyond about ninety characters is measurably harder to read. ',
    ).join(''),
  },
};

export const Translated: Story = {
  args: { author: 'user', authorLabel: 'Você', children: 'Como faço a autenticação?' },
};

/** Alignment and colour are not enough: the author is readable as text. */
export const AuthorIsReadableAsText: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('DocPilot')).toBeVisible();
  },
};
