'use client';

import { ApprovalPrompt, ToolStep } from '@docpilot/ui';
import { type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

import { type ToolCallView, proposedTicketOf, toolCallsOf } from './tool-parts';

/** Props accepted by {@link ToolSteps}. */
export interface ToolStepsProps {
  message: UIMessage;
  /** Answers an outstanding approval request. */
  onApproval: (id: string, approved: boolean) => void;
}

/** Shows what the model proposed, so the reader approves something they saw. */
function TicketProposal({ call }: { call: ToolCallView }): ReactNode {
  const t = useTranslations('agent.ticket');
  const proposal = proposedTicketOf(call);

  if (proposal === null) {
    // The input came from a model and does not describe a ticket. Saying so
    // is better than rendering a blank where the title should be, moments
    // before asking someone to approve it.
    return <p className="text-content-muted text-sm">{t('unreadable')}</p>;
  }

  return (
    <dl className="flex flex-col gap-2">
      <div className="flex flex-col">
        <dt className="text-content-muted text-xs">{t('title')}</dt>
        <dd className="font-medium">{proposal.title}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-content-muted text-xs">{t('body')}</dt>
        <dd className="whitespace-pre-wrap">{proposal.body}</dd>
      </div>
      {proposal.labels.length === 0 ? null : (
        <div className="flex flex-col">
          <dt className="text-content-muted text-xs">{t('labels')}</dt>
          <dd>{proposal.labels.join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The agent's work, above the answer it produced.
 *
 * Every call is shown, collapsed, so the transcript stays readable while the
 * work stays inspectable. An agent whose steps are invisible cannot be
 * trusted or debugged.
 *
 * Only `create_ticket` carries an approval, and only while one is
 * outstanding. Once answered, the step shows what happened — created, or
 * declined — rather than the buttons disappearing with no trace.
 */
export function ToolSteps({ message, onApproval }: ToolStepsProps): ReactNode {
  const t = useTranslations('agent');
  const calls = useMemo(() => toolCallsOf(message), [message]);
  // Blocks both buttons once an answer is on its way, so a double click
  // cannot send two.
  const [answering, setAnswering] = useState<string | null>(null);

  if (calls.length === 0) {
    return null;
  }

  return (
    <ol className="mb-3 flex flex-col gap-2">
      {calls.map((call) => (
        <li key={call.toolCallId}>
          <ToolStep
            name={call.name}
            status={call.status}
            statusLabel={t(`status.${call.status}`)}
            toggleLabel={t('toggle', { tool: call.name })}
            inputLabel={t('input')}
            outputLabel={t('output')}
            {...(call.input === undefined ? {} : { input: call.input })}
            {...(call.output === undefined ? {} : { output: call.output })}
            {...(call.approvalId === undefined
              ? {}
              : {
                  approval: (
                    <ApprovalPrompt
                      question={t('approval.question')}
                      approveLabel={t('approval.approve')}
                      denyLabel={t('approval.deny')}
                      busy={answering === call.approvalId}
                      onApprove={() => {
                        setAnswering(call.approvalId ?? null);
                        onApproval(call.approvalId ?? '', true);
                      }}
                      onDeny={() => {
                        setAnswering(call.approvalId ?? null);
                        onApproval(call.approvalId ?? '', false);
                      }}
                    >
                      <TicketProposal call={call} />
                    </ApprovalPrompt>
                  ),
                })}
          />
        </li>
      ))}
    </ol>
  );
}
