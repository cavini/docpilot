'use client';

import { Button, Mark, MessageBubble, Spinner } from '@docpilot/ui';
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

  /**
   * Asks one of the suggested questions straight away.
   *
   * Filling the box and waiting for a second click made the suggestion a
   * typing shortcut for a question the reader had not chosen to ask. It
   * reads as a button, so it behaves as one.
   */
  const askSuggestion = (suggestion: string): void => {
    if (!busy) {
      ask(suggestion);
    }
  };

  // Stable, so the message components below can memoise on it.
  const openCitations = useCallback((messageId: string, n: number): void => {
    setOpen({ messageId, n });
  }, []);

  const focusedMessage =
    open === null ? undefined : messages.find((message) => message.id === open.messageId);

  return (
    /*
      Fills the pane and scrolls inside itself. The previous version capped
      the transcript at 55vh because the page was not height constrained;
      inside the shell it is, so the transcript can own the space that is
      left and the composer can stay pinned to the bottom where a reader
      expects to type.
    */
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t('heading')}>
        <div
          ref={transcript}
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:gap-6 sm:px-5 sm:py-6"
          role="log"
          aria-live="polite"
          aria-label={t('transcriptLabel')}
        >
          {messages.length === 0 ? <ChatWelcome onAsk={askSuggestion} /> : null}

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

        {/* Pinned to the bottom of the pane. The composer is the one thing
            on the screen a reader always needs to find. */}
        <div className="border-border-subtle bg-surface shrink-0 border-t px-4 py-3 sm:px-5 sm:py-4">
          <div className="text-content-muted mx-auto mb-2 flex w-full max-w-3xl items-center justify-between gap-3 text-xs">
            {/*
              A checkbox rather than two endpoints behind two buttons: the
              question is the same either way, and what changes is whether
              the model may reach for a tool to answer it.

              Labelled by what the reader gets rather than by what it
              switches. "Use tools" named the implementation, which meant
              nothing to anyone who had not read the code.
            */}
            <label className="flex cursor-pointer items-center gap-2">
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
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  reset();
                }}
                className="hover:text-content transition-colors"
              >
                {t('newConversation')}
              </button>
            )}
          </div>
          <form
            onSubmit={onSubmit}
            className="border-border bg-surface-raised shadow-soft focus-within:border-accent mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border p-2 transition-colors"
          >
            <label htmlFor="chat-question" className="sr-only">
              {t('questionLabel')}
            </label>
            <textarea
              id="chat-question"
              rows={1}
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
              className="text-content placeholder:text-content-muted max-h-40 min-h-10 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm outline-none"
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
        </div>
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

/**
 * What fills the pane before anyone has asked anything.
 *
 * The previous empty state was a dashed box saying "Ask a question" above an
 * input that already said "Ask about your documents", and claimed the
 * documents were "above" when they were below. Two labels, one of them
 * wrong, and nothing a reader could act on.
 *
 * This says what the thing does and hands over three questions the seeded
 * corpus can actually answer. A reader who has never seen the app can get a
 * cited answer without typing a word, which is the whole point of a demo.
 */
function ChatWelcome({ onAsk }: { onAsk: (question: string) => void }) {
  const t = useTranslations('chat');
  const examples = ['auth', 'rateLimits', 'refunds'] as const;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center sm:gap-6 sm:py-10">
      <div className="bg-accent-soft text-accent flex size-12 items-center justify-center rounded-2xl sm:size-14">
        <Mark size={26} />
      </div>

      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-content text-lg font-semibold tracking-tight sm:text-xl">
          {t('welcome.title')}
        </h2>
        {/*
          Hidden on the smallest screens. Three lines of explanation above
          three buttons that explain themselves is a paragraph a reader has
          to get past, on the one screen where vertical space is scarce.
        */}
        <p className="text-content-muted hidden text-sm leading-relaxed sm:block">
          {t('welcome.body')}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-content-muted text-xs tracking-wide uppercase">
          {t('welcome.tryLabel')}
        </span>
        <div className="flex w-full flex-col items-stretch gap-2 px-4 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:px-0">
          {examples.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onAsk(t(`welcome.examples.${key}`));
              }}
              className="border-border bg-surface-raised text-content hover:border-accent hover:text-accent shadow-soft rounded-full border px-3.5 py-1.5 text-sm transition-colors"
            >
              {t(`welcome.examples.${key}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
