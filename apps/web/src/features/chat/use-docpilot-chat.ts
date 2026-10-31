'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type Citation } from './citation.types';

/** Base URL of the Nest API. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** The `data-conversation` part the server writes first on every stream. */
interface ConversationPart {
  type: 'data-conversation';
  data: { conversationId: string };
}

/** The `data-citations` part the server writes before any text. */
interface CitationsPart {
  type: 'data-citations';
  data: { citations: Citation[] };
}

/** Narrows an unknown message part to the conversation part. */
function isConversationPart(part: { type: string }): part is ConversationPart {
  return part.type === 'data-conversation';
}

/** Narrows an unknown message part to the citations part. */
function isCitationsPart(part: { type: string }): part is CitationsPart {
  return part.type === 'data-citations';
}

/** Joins a message's text parts into the answer as rendered so far. */
export function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Citations carried by a message, in the order they were sent. */
export function citationsOf(message: UIMessage): Citation[] {
  return message.parts.filter(isCitationsPart).flatMap((part) => part.data.citations);
}

/** What the hook gives the chat view. */
export interface DocpilotChat {
  messages: UIMessage[];
  /** `ready`, `submitted`, `streaming` or `error`. */
  status: ReturnType<typeof useChat>['status'];
  error: Error | undefined;
  /** The conversation this exchange belongs to, once the server names it. */
  conversationId: string | null;
  ask: (question: string) => void;
  /** Aborts the stream in progress. The partial answer stays on screen. */
  stop: () => void;
  /** Clears the transcript and starts a new conversation. */
  reset: () => void;
  /** Re-asks the last question after a failure. */
  retry: () => void;
}

/**
 * Drives the chat against the Nest streaming endpoint.
 *
 * `useChat` owns the streaming message state, which is why chat is
 * deliberately not an RTK Query endpoint: two caches over the same data would
 * fight, and the SDK's is the one that understands a half-arrived message.
 *
 * The request body is rewritten by `prepareSendMessagesRequest`, because the
 * SDK's default shape — the whole message array — is not what this API takes.
 * The server holds the conversation and only needs the new question and which
 * conversation it belongs to, so that is what gets sent. Sending the whole
 * transcript back on every turn would also let a client rewrite its own
 * history, which is exactly the thing a server-held conversation prevents.
 *
 * @param documentIds Restrict retrieval to these documents, if any.
 *
 * @example
 * ```ts
 * const { messages, ask, stop, status } = useDocpilotChat();
 * ```
 */
export function useDocpilotChat(documentIds?: readonly string[]): DocpilotChat {
  const [conversationId, setConversationId] = useState<string | null>(null);

  /**
   * What the next request needs, held in one mutable object.
   *
   * The transport captures `prepareSendMessagesRequest` once, so the values it
   * reads cannot come from the render closure or every turn would send
   * whatever was current when the transport was built. A single ref, written
   * only from callbacks and effects and read only when a request is being
   * prepared, keeps them current without rebuilding the transport each render.
   */
  const outgoing = useRef<{ conversationId: string | null; documentIds: readonly string[] }>({
    conversationId: null,
    documentIds: documentIds ?? [],
  });
  const lastQuestion = useRef<string | null>(null);

  useEffect(() => {
    outgoing.current.documentIds = documentIds ?? [];
  }, [documentIds]);

  /*
   * `react-hooks/refs` reads a `useMemo` factory as render-phase code, so it
   * objects to the ref inside `prepareSendMessagesRequest`. That callback runs
   * when a request is being prepared, long after render.
   *
   * Reading the values at render time is precisely the bug this avoids: the
   * transport is built once, so a conversation id closed over at render would
   * be stale from the second turn onwards — every follow-up would start a new
   * conversation. Disabled for this expression only.
   */
  /* eslint-disable react-hooks/refs */
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${API_URL}/chat`,
        prepareSendMessagesRequest: ({ messages }) => {
          const { conversationId: conversation, documentIds: documents } = outgoing.current;
          const latest = messages.at(-1);
          const question = latest?.role === 'user' ? textOf(latest) : '';

          return {
            body: {
              question,
              ...(conversation === null ? {} : { conversationId: conversation }),
              ...(documents.length === 0 ? {} : { documentIds: [...documents] }),
            },
          };
        },
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const chat = useChat({
    transport,
    onData: (part) => {
      if (isConversationPart(part)) {
        outgoing.current.conversationId = part.data.conversationId;
        setConversationId(part.data.conversationId);
      }
    },
  });

  const { sendMessage, setMessages } = chat;

  const ask = useCallback(
    (question: string): void => {
      const trimmed = question.trim();

      if (trimmed === '') {
        return;
      }

      lastQuestion.current = trimmed;
      void sendMessage({ text: trimmed });
    },
    [sendMessage],
  );

  const stop = useCallback((): void => {
    // `stop` resolves once the stream is torn down; the button does not wait
    // for that, and a promise returned into an onClick is a lint error waiting
    // to become an unhandled rejection.
    void chat.stop();
  }, [chat]);

  const reset = useCallback((): void => {
    outgoing.current.conversationId = null;
    lastQuestion.current = null;
    setConversationId(null);
    setMessages([]);
  }, [setMessages]);

  const retry = useCallback((): void => {
    if (lastQuestion.current !== null) {
      void sendMessage({ text: lastQuestion.current });
    }
  }, [sendMessage]);

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    conversationId,
    ask,
    stop,
    reset,
    retry,
  };
}
