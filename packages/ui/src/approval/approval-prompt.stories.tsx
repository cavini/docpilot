import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ApprovalPrompt } from './approval-prompt';

const meta = {
  title: 'Agent/ApprovalPrompt',
  component: ApprovalPrompt,
  parameters: { layout: 'padded' },
  args: {
    question: 'Create this ticket?',
    approveLabel: 'Create it',
    denyLabel: 'No, thanks',
    onApprove: fn(),
    onDeny: fn(),
    children: (
      <dl className="flex flex-col gap-1">
        <div className="flex gap-2">
          <dt className="text-content-muted">Title</dt>
          <dd>Document the webhook retry schedule</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-content-muted">Body</dt>
          <dd>The retry schedule is described in support replies but not in the docs.</dd>
        </div>
      </dl>
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ApprovalPrompt>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Asking: Story = {};

export const Busy: Story = { args: { busy: true } };

export const Translated: Story = {
  args: {
    question: 'Criar este chamado?',
    approveLabel: 'Criar',
    denyLabel: 'Não, obrigado',
  },
};

export const LongProposal: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Document the webhook retry schedule</p>
        <p>
          {Array.from(
            { length: 6 },
            () =>
              'The retry schedule is described in support replies but not in the documentation, so every integrator asks about it. ',
          ).join('')}
        </p>
      </div>
    ),
  },
};

/** The proposal is shown in full: approving something unseen is not approval. */
export const ShowsWhatIsBeingApproved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Document the webhook retry schedule')).toBeVisible();
  },
};

export const ApproveCallsBack: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Create it' }));

    await expect(args.onApprove).toHaveBeenCalledTimes(1);
    await expect(args.onDeny).not.toHaveBeenCalled();
  },
};

export const DenyCallsBack: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'No, thanks' }));

    await expect(args.onDeny).toHaveBeenCalledTimes(1);
    await expect(args.onApprove).not.toHaveBeenCalled();
  },
};

/** Once answered, neither button fires again. */
export const BusySwallowsBothAnswers: Story = {
  args: { busy: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Create it' }));
    await userEvent.click(canvas.getByRole('button', { name: 'No, thanks' }));

    await expect(args.onApprove).not.toHaveBeenCalled();
    await expect(args.onDeny).not.toHaveBeenCalled();
  },
};
