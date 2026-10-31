'use client';

import { Button, Dropzone, EmptyState, Spinner } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import {
  useDeleteDocumentMutation,
  useListDocumentsQuery,
  useRetryDocumentMutation,
  useUploadDocumentMutation,
} from '../../store/api';
import { isInFlight } from './document.types';
import { DocumentRow } from './document-row';
import { ACCEPT_ATTRIBUTE, type RejectedFile, partitionFiles } from './validate-file';
import { useIngestionProgress } from './use-ingestion-progress';

/** Upload ceiling, mirroring the API's `MAX_UPLOAD_MB`. */
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '20');
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** A one-off message shown after an upload attempt. */
interface Notice {
  kind: 'duplicate' | 'rejected' | 'failed';
  text: string;
}

/**
 * The document library: add, watch, retry, remove.
 *
 * Everything the product can do without a model, which makes it the half that
 * behaves identically against a real provider and against the mock.
 *
 * Upload is sequential rather than concurrent. Each file is a multipart
 * request the API has to buffer, hash and store, and three at once on a slow
 * connection makes all three slower while giving the reader no useful
 * ordering. Sequential also means the notices arrive in the order the reader
 * chose the files.
 */
export function DocumentLibrary(): ReactNode {
  const t = useTranslations('documents');
  const { data, isLoading, isError, refetch } = useListDocumentsQuery();
  const [upload, uploading] = useUploadDocumentMutation();
  const [retry] = useRetryDocumentMutation();
  const [remove] = useDeleteDocumentMutation();
  const [notices, setNotices] = useState<Notice[]>([]);

  // Memoised because `data?.items ?? []` is a new array on every render, so
  // deriving the watch list from it directly would re-subscribe the socket on
  // every render rather than when the set of documents changes.
  const documents = useMemo(() => data?.items ?? [], [data?.items]);

  // Only in-flight documents are watched; see the hook for why.
  const watching = useMemo(
    () => documents.filter(isInFlight).map((document) => document.id),
    [documents],
  );
  useIngestionProgress(watching);

  const describeRejection = useCallback(
    (rejected: RejectedFile): string =>
      t(`rejected.${rejected.reason}`, { name: rejected.name, limit: MAX_UPLOAD_MB }),
    [t],
  );

  const onFiles = useCallback(
    async (files: File[]): Promise<void> => {
      const { accepted, rejected } = partitionFiles(files, MAX_BYTES);

      // A batch of three valid files and one `.docx` uploads the three.
      setNotices(rejected.map((file) => ({ kind: 'rejected', text: describeRejection(file) })));

      for (const file of accepted) {
        try {
          const result = await upload(file).unwrap();

          if (result.duplicate) {
            setNotices((current) => [
              ...current,
              { kind: 'duplicate', text: t('duplicate', { name: file.name }) },
            ]);
          }
        } catch {
          setNotices((current) => [
            ...current,
            { kind: 'failed', text: t('uploadFailed', { name: file.name }) },
          ]);
        }
      }
    },
    [describeRejection, t, upload],
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="library-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="library-heading" className="text-lg font-semibold text-content">
          {t('heading')}
        </h2>
        {uploading.isLoading ? <Spinner label={t('uploading')} /> : null}
      </div>

      <Dropzone
        accept={ACCEPT_ATTRIBUTE}
        label={t('dropzone.label')}
        hint={t('dropzone.hint', { limit: MAX_UPLOAD_MB })}
        inputLabel={t('dropzone.inputLabel')}
        disabled={uploading.isLoading}
        onFiles={(files) => {
          void onFiles(files);
        }}
      />

      {notices.length === 0 ? null : (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {notices.map((notice) => (
            <li
              key={notice.text}
              className={`rounded border px-3 py-2 text-xs ${
                notice.kind === 'duplicate'
                  ? 'border-border bg-surface-muted text-content-muted'
                  : 'border-danger/30 bg-danger/10 text-danger'
              }`}
            >
              {notice.text}
            </li>
          ))}
        </ul>
      )}

      {isLoading ? <Spinner label={t('loading')} /> : null}

      {isError ? (
        <EmptyState
          title={t('unreachable.title')}
          description={t('unreachable.description')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void refetch();
              }}
            >
              {t('unreachable.retry')}
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && documents.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.description')} />
      ) : null}

      {documents.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              onRetry={(id) => {
                void retry(id);
              }}
              onDelete={(id) => {
                void remove(id);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
