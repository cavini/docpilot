import { type ReactNode } from 'react';

/** What a badge is saying about the thing it labels. */
export type StatusTone = 'neutral' | 'progress' | 'ok' | 'warn' | 'danger';

/** Props accepted by {@link StatusBadge}. */
export interface StatusBadgeProps {
  /** Which colour to use. */
  tone?: StatusTone;
  /** The label. Already localised by the caller. */
  children: ReactNode;
}

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-surface-muted text-content-muted border-border',
  progress: 'bg-surface-muted text-accent border-accent/30',
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
};

/**
 * A small coloured label for a state.
 *
 * Colour is never the only signal — the word is always present — because a
 * reader who cannot distinguish the hues still has to be able to tell `ready`
 * from `failed`.
 *
 * @example
 * ```tsx
 * <StatusBadge tone="ok">Ready</StatusBadge>
 * ```
 */
export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps): ReactNode {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
