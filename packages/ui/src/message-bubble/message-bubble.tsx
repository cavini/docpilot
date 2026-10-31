import { type ReactNode } from 'react';

/** Who produced a message. */
export type MessageAuthor = 'user' | 'assistant';

/** Props accepted by {@link MessageBubble}. */
export interface MessageBubbleProps {
  /** Who said it. */
  author: MessageAuthor;
  /** Label announced before the content, such as "You" or "DocPilot". */
  authorLabel: string;
  /** The message content, already rendered. */
  children: ReactNode;
  /** Shown under the message — a timestamp, a cost, or a stopped notice. */
  footer?: ReactNode;
}

/**
 * One turn in a conversation.
 *
 * The author is conveyed three ways: alignment, colour, and a label that is
 * visible to assistive technology. Alignment and colour alone make a
 * transcript meaningless to a screen reader, which reads the messages as one
 * undifferentiated run of text.
 *
 * Text selection is deliberately not suppressed anywhere in here. Copying an
 * answer out is one of the most common things a reader does with one.
 *
 * @example
 * ```tsx
 * <MessageBubble author="assistant" authorLabel="DocPilot">…</MessageBubble>
 * ```
 */
export function MessageBubble({
  author,
  authorLabel,
  children,
  footer,
}: MessageBubbleProps): ReactNode {
  const mine = author === 'user';

  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <span className="px-1 text-xs font-medium text-content-muted">{authorLabel}</span>
      <div
        className={`max-w-[46rem] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          mine
            ? 'bg-accent text-accent-contrast'
            : 'border border-border bg-surface-muted text-content'
        }`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <span className="px-1 text-xs text-content-muted">{footer}</span>
      )}
    </div>
  );
}
