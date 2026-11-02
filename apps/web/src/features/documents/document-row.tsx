'use client';

import { Button, Progress } from '@docpilot/ui';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { type DocumentStatus, type DocumentSummary, isInFlight } from './document.types';
import { formatBytes, formatTimestamp } from './format';

/** Props accepted by {@link DocumentRow}. */
export interface DocumentRowProps {
  document: DocumentSummary;
  /** Re-queues a failed document. */
  onRetry: (id: string) => void;
  /** Removes a document and everything derived from it. */
  onDelete: (id: string) => void;
  /** True while a mutation for this row is in flight. */
  busy?: boolean;
}

/** Which badge colour each status gets. */
/**
 * One document in the library.
 *
 * Renders three different things depending on state, because a reader watching
 * an upload, a reader looking at a finished corpus, and a reader facing a
 * failure all need different information:
 *
 * - **In flight**: a progress bar and the current stage.
 * - **Ready**: the chunk count, which is what makes it searchable, plus pages
 *   where the format has them.
 * - **Failed**: the server's own reason, and a retry.
 *
 * Delete asks for confirmation inline rather than through `window.confirm`,
 * which blocks the page and cannot be styled or translated.
 */
export function DocumentRow({
  document,
  onRetry,
  onDelete,
  busy = false,
}: DocumentRowProps): ReactNode {
  const t = useTranslations('documents');
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const inFlight = isInFlight(document);
  const [showActions, setShowActions] = useState(false);

  return (
    /*
      A row, not a card. The previous version gave a filename, a size, a
      language, a passage count, a page count and a date equal weight on
      every document, so ten documents were a wall of grey and the title -
      the only part anyone reads - was lost in it.
      
      What is left is the title, a dot for the state, and the detail revealed
      on hover or focus. Everything removed is still reachable; it just
      stopped shouting.
    */
    /*
      `relative`, because the actions below are positioned over the row
      rather than inserted into it. Revealing them in the flow changed the
      row's height, so pointing at one document shoved every document under
      it down the list - the list moved out from under the cursor.
    */
    <li className="group border-border-subtle hover:bg-surface-muted focus-within:bg-surface-muted relative rounded-lg border border-transparent px-2.5 py-2 transition-colors">
      <div className="flex items-center gap-2.5">
        <StatusDot
          status={document.status}
          label={t(`status.${document.status}`)}
          // The word is shown below for every state but `ready`, so
          // announcing it here too would read it twice.
          announce={document.status === 'ready'}
        />
        {/*
          Padded on the right by the width the actions occupy, always rather
          than on hover, so a long title is never covered by them and the
          text never shifts when they appear.
        */}
        <span className="text-content min-w-0 flex-1 truncate pr-20 text-sm" title={document.title}>
          {document.title}
        </span>
      </div>

      <p className="text-content-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 pl-5 text-xs">
        {/*
          Pages where there are pages, bytes otherwise. "9 pages" tells a
          reader something about a document; "4.2 kB" tells them about a
          file. Only one fits in a rail, so the meaningful one wins.
        */}
        <span className="truncate">
          {document.pageCount === null
            ? formatBytes(document.sizeBytes, locale)
            : t('pages', { count: document.pageCount })}
        </span>
        {document.language === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{t(`language.${document.language}`)}</span>
          </>
        )}
        {/*
          Here rather than in the corner on hover. It shared that corner
          with the row's actions, so pointing at a document put a Delete
          button straight on top of the count.
        */}
        {document.status === 'ready' ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{t('chunks', { count: document.chunkCount })}</span>
          </>
        ) : null}
        {document.status === 'ready' ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{t(`status.${document.status}`)}</span>
          </>
        )}
        <span className="sr-only">{formatTimestamp(document.createdAt, locale)}</span>
      </p>

      {inFlight ? (
        <Progress value={document.progress} label={t('progressLabel', { title: document.title })}>
          {`${String(Math.round(document.progress))}%`}
        </Progress>
      ) : null}

      {document.status === 'failed' ? (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {/*
            The server's message is shown as received rather than translated.
            A catalogue of every server message in the client goes stale the
            moment the server rewords one; the surrounding interface is what
            gets localised.
          */}
          {document.error ?? t('failedWithoutReason')}
        </p>
      ) : null}

      {/*
        Revealed on hover or focus, so a library reads as a list of titles
        rather than a column of buttons - except where there is no hover to
        give, and except on a document that failed, where the retry is the
        only thing the row is for.
      */}
      {/*
        Where there is no hover to give, a muted toggle rather than the
        actions themselves. Revealing them permanently turned the library
        into a column of Delete buttons - a destructive action given the
        most prominent thing in every row, on the screen with the least
        room for it.
      */}
      <button
        type="button"
        aria-expanded={showActions}
        aria-label={t('actionsLabel', { title: document.title })}
        onClick={() => {
          setShowActions((open) => !open);
        }}
        className="text-content-muted hover:text-content absolute top-1 right-1 hidden rounded px-2 py-1 text-sm leading-none [@media(hover:none)]:block"
      >
        ⋯
      </button>

      <div
        className={`bg-surface-muted absolute top-1.5 right-1.5 items-center gap-1 rounded-md shadow-sm group-focus-within:flex group-hover:flex ${
          document.status === 'failed' || showActions ? 'flex' : 'hidden'
        }`}
      >
        {document.status === 'failed' ? (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => {
              onRetry(document.id);
            }}
          >
            {t('retry')}
          </Button>
        ) : null}

        {confirming ? (
          <>
            <span className="text-xs text-content-muted">{t('deleteConfirm')}</span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => {
                setConfirming(false);
                onDelete(document.id);
              }}
            >
              {t('deleteConfirmYes')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('cancel')}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('delete')}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The state of a document, as a dot.
 *
 * A badge per row made a sidebar of badges. A dot carries the same three
 * states in a tenth of the space, with the word still available to a screen
 * reader and in the detail line below.
 */
function StatusDot({
  status,
  label,
  announce,
}: {
  status: DocumentStatus;
  label: string;
  /** Whether this dot is the only place the state is stated. */
  announce: boolean;
}) {
  // The three ingestion stages are one thing to a reader: it is working.
  const tone: Record<DocumentStatus, string> = {
    queued: 'bg-content-muted',
    parsing: 'bg-warn animate-pulse',
    chunking: 'bg-warn animate-pulse',
    embedding: 'bg-warn animate-pulse',
    ready: 'bg-ok',
    failed: 'bg-danger',
  };

  return (
    <span className="flex size-2.5 shrink-0 items-center justify-center">
      <span className={`size-2 rounded-full ${tone[status]}`} aria-hidden />
      {announce ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
