import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { ToolStep } from './tool-step';

const meta = {
  title: 'Agent/ToolStep',
  component: ToolStep,
  parameters: { layout: 'padded' },
  args: {
    name: 'search_docs',
    status: 'done',
    statusLabel: 'Done',
    input: '{\n  "query": "bearer token expiry"\n}',
    output: '{\n  "results": [\n    { "n": 1, "documentTitle": "lumen-api" }\n  ]\n}',
    toggleLabel: 'Show what search_docs did',
    inputLabel: 'Input',
    outputLabel: 'Output',
  },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: ['running', 'done', 'failed', 'awaiting-approval', 'denied'],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ToolStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Done: Story = {};

export const Running: Story = {
  args: { status: 'running', statusLabel: 'Running', output: undefined },
};

export const Failed: Story = {
  args: {
    status: 'failed',
    statusLabel: 'Failed',
    output: '{\n  "ok": false,\n  "code": "not_found"\n}',
  },
};

export const AwaitingApproval: Story = {
  args: { name: 'create_ticket', status: 'awaiting-approval', statusLabel: 'Needs approval' },
};

export const Denied: Story = {
  args: { name: 'create_ticket', status: 'denied', statusLabel: 'Declined', output: undefined },
};

export const WithoutDetail: Story = {
  args: { input: undefined, output: undefined },
};

export const Translated: Story = {
  args: {
    statusLabel: 'Concluído',
    toggleLabel: 'Mostrar o que search_docs fez',
    inputLabel: 'Entrada',
    outputLabel: 'Saída',
  },
};

export const LongOutputScrollsInsideTheStep: Story = {
  args: {
    output: Array.from(
      { length: 40 },
      (_, at) => `line ${String(at + 1)} of a long tool result`,
    ).join('\n'),
  },
};

/** Collapsed by default: a tool result buries the answer the reader came for. */
export const CollapsedByDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('Input')).toBeNull();
  },
};

export const ExpandingShowsInputAndOutput: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button'));

    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Input')).toBeVisible();
    await expect(canvas.getByText('Output')).toBeVisible();
  },
};

/** The toggle says what it opens, not just "+". */
export const ToggleIsLabelled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button', { name: 'Show what search_docs did' })).toBeVisible();
  },
};

/** A step with nothing to show offers no control to show it. */
export const NoToggleWithoutDetail: Story = {
  args: { input: undefined, output: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};
