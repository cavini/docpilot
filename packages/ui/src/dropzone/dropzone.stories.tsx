import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Dropzone } from './dropzone';

const meta = {
  title: 'Primitives/Dropzone',
  component: Dropzone,
  parameters: { layout: 'padded' },
  args: {
    onFiles: fn(),
    accept: '.pdf,.md,.txt',
    label: 'Drop a document here',
    hint: 'PDF, Markdown or plain text, up to 20 MB',
    inputLabel: 'Choose a document to upload',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Dropzone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Resting: Story = {};

export const WithoutHint: Story = { args: { hint: undefined } };

export const Disabled: Story = { args: { disabled: true } };

export const Translated: Story = {
  args: {
    label: 'Arraste um documento aqui',
    hint: 'PDF, Markdown ou texto, até 20 MB',
    inputLabel: 'Escolher um documento para enviar',
  },
};

/** The keyboard path is the browser's own: a real, focusable file input. */
export const InputIsFocusable: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Choose a document to upload');

    input.focus();
    await expect(input).toHaveFocus();
  },
};

/** Choosing a file through the picker reaches the handler. */
export const ChoosingAFileEmitsIt: Story = {
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Choose a document to upload');
    const file = new File(['# Guide'], 'guide.md', { type: 'text/markdown' });

    await userEvent.upload(input, file);

    await expect(args.onFiles).toHaveBeenCalledWith([file]);
  },
};

/** Choosing the same file twice must fire twice; the input resets its value. */
export const SameFileTwiceFiresTwice: Story = {
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Choose a document to upload');
    const file = new File(['# Guide'], 'guide.md', { type: 'text/markdown' });

    await userEvent.upload(input, file);
    await userEvent.upload(input, file);

    await expect(args.onFiles).toHaveBeenCalledTimes(2);
  },
};

/** A disabled zone does not accept a choice. */
export const DisabledDoesNotEmit: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Choose a document to upload');

    await userEvent.upload(input, new File(['x'], 'a.md', { type: 'text/markdown' }));

    await expect(args.onFiles).not.toHaveBeenCalled();
  },
};
