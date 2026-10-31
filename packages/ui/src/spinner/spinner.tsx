import { type ReactNode } from 'react';

/** Props accepted by {@link Spinner}. */
export interface SpinnerProps {
  /** What is loading, for assistive technology. */
  label: string;
}

/**
 * An indeterminate busy indicator.
 *
 * For waits whose length is unknown. Anything with a measurable completion
 * should use {@link Progress} instead, because a spinner tells the reader
 * nothing about whether to keep waiting.
 *
 * @example
 * ```tsx
 * <Spinner label="Loading documents" />
 * ```
 */
export function Spinner({ label }: SpinnerProps): ReactNode {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-content-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
