import { type ReactNode } from 'react';

import { Button } from '../button/button';

/** Props accepted by {@link ApprovalPrompt}. */
export interface ApprovalPromptProps {
  /** What is being asked, in one line. */
  question: ReactNode;
  /** The whole proposal, shown in full. */
  children: ReactNode;
  approveLabel: string;
  denyLabel: string;
  onApprove: () => void;
  onDeny: () => void;
  /** Blocks both buttons once an answer has been sent. */
  busy?: boolean;
}

/**
 * Asks the reader to approve something before it happens.
 *
 * The proposal is shown **in full**, not summarised. Approving something
 * unseen is not approval, and a dialog that says "create a ticket?" without
 * showing the ticket is a confirmation box pretending to be a safeguard.
 *
 * Deny is not styled as a destructive action, because it is not one — it is
 * the default outcome, and the reader choosing it should not feel they are
 * doing something drastic.
 *
 * @example
 * ```tsx
 * <ApprovalPrompt question="Create this ticket?" onApprove={yes} onDeny={no} …>
 *   <TicketPreview … />
 * </ApprovalPrompt>
 * ```
 */
export function ApprovalPrompt({
  question,
  children,
  approveLabel,
  denyLabel,
  onApprove,
  onDeny,
  busy = false,
}: ApprovalPromptProps): ReactNode {
  return (
    <div
      role="group"
      className="border-warn/40 bg-warn/5 flex flex-col gap-3 rounded-lg border px-3 py-3"
    >
      <p className="text-content text-sm font-medium">{question}</p>

      <div className="text-content text-sm">{children}</div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} onClick={onApprove}>
          {approveLabel}
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={onDeny}>
          {denyLabel}
        </Button>
      </div>
    </div>
  );
}
