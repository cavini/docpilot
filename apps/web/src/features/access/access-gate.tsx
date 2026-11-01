'use client';

import { Spinner } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { useAccess } from './use-access';
import { UnlockForm } from './unlock-form';

/** Props accepted by {@link AccessGate}. */
export interface AccessGateProps {
  /** The application, rendered only once the reader is through. */
  children: ReactNode;
}

/**
 * Stands between the reader and the application.
 *
 * On a gated deployment with no stored key, **nothing is requested** - the
 * form renders and the API is never called. That is the point: a crawler that
 * finds the URL gets a form, and the provider balance is untouched.
 *
 * On an open deployment it renders its children and gets out of the way, so
 * local development is unchanged.
 */
export function AccessGate({ children }: AccessGateProps): ReactNode {
  const t = useTranslations('access');
  const { status, budgetSpent, resetsAt, rejected, unlock } = useAccess();

  if (status === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t('checking')} />
      </div>
    );
  }

  if (status === 'locked') {
    return <UnlockForm onUnlock={unlock} rejected={rejected} />;
  }

  return (
    <>
      {budgetSpent ? <BudgetNotice resetsAt={resetsAt} /> : null}
      {children}
    </>
  );
}

/**
 * Says that today's answers are canned.
 *
 * Above the content rather than beside it, because a reader who has already
 * read an answer cannot unread it. Said plainly: the alternative is a visitor
 * concluding the product is bad at its job.
 */
function BudgetNotice({ resetsAt }: { resetsAt: string | null }): ReactNode {
  const t = useTranslations('access');

  return (
    <div
      role="status"
      className="border-warn/30 bg-warn/10 text-content border-b px-6 py-2 text-sm"
    >
      {resetsAt === null
        ? t('budgetSpent')
        : t('budgetSpentUntil', { resetsAt: new Date(resetsAt) })}
    </div>
  );
}
