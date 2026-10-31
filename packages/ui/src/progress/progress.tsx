import { type ReactNode } from 'react';

/** Props accepted by {@link Progress}. */
export interface ProgressProps {
  /** Completion from 0 to 100. Values outside that range are clamped. */
  value: number;
  /** What is progressing, for assistive technology. */
  label: string;
  /** Optional text shown beside the bar. */
  children?: ReactNode;
  /** Renders in the error colour, for a job that failed part-way. */
  failed?: boolean;
}

/**
 * A determinate progress bar.
 *
 * Built on `role="progressbar"` with the three ARIA value attributes rather
 * than on a `<progress>` element, because `<progress>` cannot be styled
 * consistently across browsers and the native one offers nothing this needs.
 *
 * The value is clamped rather than validated. A progress bar is the wrong
 * place to throw: a processor reporting 103% is a bug worth logging, not a
 * reason to take the page down while someone is watching their upload.
 *
 * @example
 * ```tsx
 * <Progress value={42} label="Ingesting handbook.pdf">42%</Progress>
 * ```
 */
export function Progress({ value, label, children, failed = false }: ProgressProps): ReactNode {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            failed ? 'bg-danger' : 'bg-accent'
          }`}
          style={{ width: `${String(clamped)}%` }}
        />
      </div>
      {children === undefined ? null : (
        <span className="shrink-0 text-xs tabular-nums text-content-muted">{children}</span>
      )}
    </div>
  );
}
