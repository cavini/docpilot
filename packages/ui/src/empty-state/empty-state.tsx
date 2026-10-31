import { type ReactNode } from 'react';

/** Props accepted by {@link EmptyState}. */
export interface EmptyStateProps {
  /** One short line naming what is missing. */
  title: ReactNode;
  /** What the reader can do about it. */
  description?: ReactNode;
  /** An action, usually a button. */
  action?: ReactNode;
}

/**
 * What to show where a list would be, when the list is empty.
 *
 * Deliberately a component rather than a convention, because "nothing here
 * yet" is the first thing most readers of this app will see, and an empty
 * table that explains nothing reads as a failure rather than as a starting
 * point.
 *
 * @example
 * ```tsx
 * <EmptyState title="No documents yet" description="Add a PDF to get started" />
 * ```
 */
export function EmptyState({ title, description, action }: EmptyStateProps): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium text-content">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-prose text-sm text-content-muted">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}
