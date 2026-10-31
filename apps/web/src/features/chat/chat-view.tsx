'use client';

import { Button, EmptyState, MessageBubble, Spinner } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { AssistantMessage } from './assistant-message';
import { CitationsPanel } from './citations-panel';
import { type ChatMode, citationsOf, textOf, useDocpilotChat } from './use-docpilot-chat';

/** Which answer's sources are open, and which of them is focused. */
interface OpenSources {
  messageId: string;
  n: number;
}

/**
 * The chat interface.
 *
 * Three things here are about the shape of a streamed conversation rather
 * than about looks:
 *
 * - **Citations render before the text does.** They arrive first on purpose,
 *   so the sources are available the moment the first marker appears.
 * - **Stop is offered while streaming, not after.** A reader who has seen
 *   enough should not have to wait for the rest, and stopping also stops the
 *   provider billing.
 * - **An error becomes a message in the transcript**, not a toast. A toast
 *   disappears and leaves a conversation with an unexplained gap in it.
 */
export function ChatView(): ReactNode {
  const t = useTranslations('chat');
  const [mode, setMode] = useState<ChatMode>('chat');
  const { messages, status, error, ask, stop, reset, retry, answerApproval } =
    useDocpilotChat(mode);
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState<OpenSources | null>(null);
  const transcript = useRef<HTMLDivElement | null>(null);

  const busy = status === 'submitted' || status === 'streaming';

  // Follow the answer as it arrives, which is what a reader expects of a
  // transcript. Scrolls the container, not the page, so the composer stays put.
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (event: { preventDefault: () => void }): void => {
    event.preventDefault();

    if (!busy) {
      ask(question);
      setQuestion('');
    }
  };

  // Stable, so the message components below can memoise on it.
  const openCitations = useCallback((messageId: string, n: number): void => {
    setOpen({ messageId, n });
  }, []);

  const focusedMessage =
    open === null ? undefined : messages.find((message) => message.id === open.messageId);

  return (
    <div className="flex gap-4">
      <section className="flex min-w-0 flex-1 flex-col gap-4" aria-labelledby="chat-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="chat-heading" className="text-content text-lg font-semibold">
            {t('heading')}
          </h2>
          <div className="flex items-center gap-3">
            {/*
              A checkbox rather than two endpoints behind two buttons: the
              question is the same either way, and what changes is whether the
              model may reach for a tool to answer it.
            */}
            <label className="text-content-muted flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mode === 'agent'}
                disabled={busy}
                onChange={(event) => {
                  setMode(event.target.checked ? 'agent' : 'chat');
                }}
                className="accent-accent"
              />
              {t('useTools')}
            </label>

            {messages.length === 0 ? null : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(null);
                  reset();
                }}
              >
                {t('newConversation')}
              </Button>
            )}
          </div>
        </div>

        {/*
          Bounded rather than flex-1: the page is not height constrained, so a
          growing transcript would scroll the whole page and push the composer
          off the bottom. Capped, it scrolls inside itself and the composer
          stays where the reader left it.
        */}
        <div
          ref={transcript}
          className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto"
          role="log"
          aria-live="polite"
          aria-label={t('transcriptLabel')}
        >
          {messages.length === 0 ? (
            <EmptyState title={t('empty.title')} description={t('empty.description')} />
          ) : null}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              author={message.role === 'user' ? 'user' : 'assistant'}
              authorLabel={message.role === 'user' ? t('you') : t('assistant')}
            >
              {message.role === 'user' ? (
                textOf(message)
              ) : (
                <AssistantMessage
                  message={message}
                  onCite={openCitations}
                  onApproval={answerApproval}
                />
              )}
            </MessageBubble>
          ))}

          {status === 'submitted' ? <Spinner label={t('thinking')} /> : null}

          {error === undefined ? null : (
            <div className="border-danger/30 bg-danger/10 flex flex-col items-start gap-2 rounded-lg border px-4 py-3">
              <p className="text-danger text-sm">{t('failed')}</p>
              <Button size="sm" variant="secondary" onClick={retry}>
                {t('retry')}
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label htmlFor="chat-question" className="sr-only">
            {t('questionLabel')}
          </label>
          <textarea
            id="chat-question"
            rows={2}
            value={question}
            placeholder={t('placeholder')}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter inserts a newline — the convention
              // every chat interface uses, so doing anything else is a
              // surprise rather than a choice.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
            }}
            className="border-border bg-surface text-content focus-visible:border-accent min-h-16 flex-1 resize-y rounded-lg border px-3 py-2 text-sm"
          />
          {busy ? (
            <Button variant="secondary" onClick={stop}>
              {t('stop')}
            </Button>
          ) : (
            <Button type="submit" disabled={question.trim() === ''}>
              {t('send')}
            </Button>
          )}
        </form>
      </section>

      <CitationsPanel
        citations={focusedMessage === undefined ? [] : citationsOf(focusedMessage)}
        focused={open?.n ?? null}
        onClose={() => {
          setOpen(null);
        }}
      />
    </div>
  );
}
