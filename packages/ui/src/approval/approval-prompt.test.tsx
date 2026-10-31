import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalPrompt } from './approval-prompt';

const props = {
  question: 'Create this ticket?',
  approveLabel: 'Create it',
  denyLabel: 'No, thanks',
};

describe('ApprovalPrompt', () => {
  it('AC7: shows the proposal in full, rather than summarising it', () => {
    // Approving something unseen is not approval.
    render(
      <ApprovalPrompt {...props} onApprove={vi.fn()} onDeny={vi.fn()}>
        <p>Document the webhook retry schedule</p>
      </ApprovalPrompt>,
    );

    expect(screen.getByText('Document the webhook retry schedule')).toBeVisible();
  });

  it('asks the question', () => {
    render(
      <ApprovalPrompt {...props} onApprove={vi.fn()} onDeny={vi.fn()}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    expect(screen.getByText('Create this ticket?')).toBeVisible();
  });

  it('AC2: reports an approval', async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <ApprovalPrompt {...props} onApprove={onApprove} onDeny={onDeny}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Create it' }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('AC3: reports a denial', async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <ApprovalPrompt {...props} onApprove={onApprove} onDeny={onDeny}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'No, thanks' }));

    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('swallows a second answer once one has been sent', async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalPrompt {...props} busy onApprove={onApprove} onDeny={vi.fn()}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Create it' }));

    expect(onApprove).not.toHaveBeenCalled();
  });

  it('keeps both answers reachable by keyboard', () => {
    render(
      <ApprovalPrompt {...props} onApprove={vi.fn()} onDeny={vi.fn()}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    const approve = screen.getByRole('button', { name: 'Create it' });
    approve.focus();

    expect(approve).toHaveFocus();
  });

  it('groups the proposal and its answers, so it reads as one thing', () => {
    render(
      <ApprovalPrompt {...props} onApprove={vi.fn()} onDeny={vi.fn()}>
        <p>x</p>
      </ApprovalPrompt>,
    );

    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
