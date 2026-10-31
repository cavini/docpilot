'use client';

import { type UIMessage } from 'ai';
import { type ReactNode, useCallback, useMemo } from 'react';

import { Answer } from './answer';
import { citationsOf, textOf } from './use-docpilot-chat';

/** Props accepted by {@link AssistantMessage}. */
export interface AssistantMessageProps {
  message: UIMessage;
  /** Called with the message and the citation number whose chip was pressed. */
  onCite: (messageId: string, n: number) => void;
}

/**
 * One assistant turn.
 *
 * Exists to hold the memoisation rather than for the markup, which is one
 * element. `textOf` and `citationsOf` derive new values from the message on
 * every call, and `Answer` memoises its renderers on those values — so
 * deriving them in the parent, which re-renders whenever anything on the page
 * changes, would defeat the memo and remount the whole answer each time.
 *
 * That is not only wasteful: a remount replaces every citation chip with a new
 * DOM node, so restoring focus to "the chip that opened the panel" lands on an
 * element no longer in the document.
 */
export function AssistantMessage({ message, onCite }: AssistantMessageProps): ReactNode {
  const text = useMemo(() => textOf(message), [message]);
  const citations = useMemo(() => citationsOf(message), [message]);

  const cite = useCallback(
    (n: number): void => {
      onCite(message.id, n);
    },
    [message.id, onCite],
  );

  return <Answer text={text} citations={citations} onCite={cite} />;
}
