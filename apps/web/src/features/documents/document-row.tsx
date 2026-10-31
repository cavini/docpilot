'use client';

import { Button, Progress, StatusBadge, type StatusTone } from '@docpilot/ui';
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
const TONE: Record<DocumentStatus, StatusTone> = {
  queued: 'neutral',
  parsing: 'progress',
  chunking: 'progress',
  embedding: 'progress',
  ready: 'ok',
  failed: 'danger',
};

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

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate font-medium text-content" title={document.title}>
          {document.title}
        </span>
        <StatusBadge tone={TONE[document.status]}>{t(`status.${document.status}`)}</StatusBadge>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-muted">
        <span>{document.sourceFilename}</span>
        <span aria-hidden="true">·</span>
        <span>{formatBytes(document.sizeBytes, locale)}</span>
        {document.language === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{t(`language.${document.language}`)}</span>
          </>
        )}
        {document.status === 'ready' ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{t('chunks', { count: document.chunkCount })}</span>
            {document.pageCount === null ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>{t('pages', { count: document.pageCount })}</span>
              </>
            )}
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>{formatTimestamp(document.createdAt, locale)}</span>
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

      <div className="flex flex-wrap items-center gap-2">
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
