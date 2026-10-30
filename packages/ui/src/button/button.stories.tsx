import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from './button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Send',
    onClick: fn(),
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const Ghost: Story = {
  args: { variant: 'ghost' },
};

export const Small: Story = {
  args: { size: 'sm' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Loading: Story = {
  args: { loading: true, children: 'Uploading' },
};

/** Long labels appear in real use; the button must not clip them. */
export const LongLabel: Story = {
  args: { children: 'Extract every endpoint from the billing documentation' },
};

/** Portuguese labels run longer than English ones, which is what breaks layouts. */
export const Translated: Story = {
  args: { children: 'Enviar pergunta sobre a documentação' },
};

/** Interaction test: a click reaches the handler. */
export const ClickCallsHandler: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));

    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** Interaction test: a loading button swallows the click but stays focusable. */
export const LoadingSwallowsClicks: Story = {
  args: { loading: true, children: 'Uploading' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Uploading' });

    await expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();

    // Still reachable by keyboard, unlike a `disabled` button.
    button.focus();
    await expect(button).toHaveFocus();
  },
};
