'use client';

import { Button, Spinner, StatusBadge } from '@docpilot/ui';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { type ExtractionCitation, type SchemaSummary } from './extraction.types';
import { ExtractionTable } from './extraction-table';
import { fetchSchemas, useExtraction } from './use-extraction';

/**
 * Hands the reader the extracted items as a JSON file.
 *
 * Self-describing rather than a bare array: the shape it was extracted with
 * and the passages it came from travel with the data. A file that has lost
 * its provenance is a file nobody downstream can check, and provenance is the
 * one thing every answer here carries.
 *
 * A blob URL revoked immediately after the click, rather than one kept for
 * the page's lifetime: the data is already in memory, and an unrevoked blob
 * holds a copy of it until the tab closes.
 *
 * @param items What to download.
 * @param schema Names the shape, and names the file so several downloads are
 *   distinguishable.
 * @param citations The passages the items were read from.
 */
function download(items: unknown[], schema: string, citations: ExtractionCitation[]): void {
  const body = { schema, items, citations };
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${schema}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Structured extraction: choose a shape, watch the table fill, take the JSON.
 *
 * The chooser is built from `GET /extract/schemas` rather than from a list
 * here, so a schema added on the server appears without a front-end release.
 */
export function ExtractionView(): ReactNode {
  const t = useTranslations('extraction');
  const locale = useLocale();
  const [schemas, setSchemas] = useState<SchemaSummary[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loadFailed, setLoadFailed] = useState(false);
  const { status, items, citations, dropped, error, run, stop, reset } = useExtraction();

  useEffect(() => {
    const controller = new AbortController();

    void fetchSchemas(controller.signal)
      .then((loaded) => {
        setSchemas(loaded);
        setSelected((current) => (current === '' ? (loaded[0]?.name ?? '') : current));
      })
      .catch(() => {
        // Aborting on unmount lands here too; a failed load shows as the
        // chooser staying empty rather than as an error nobody can act on.
        setLoadFailed(!controller.signal.aborted);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const schema = schemas.find((entry) => entry.name === selected);
  const running = status === 'running';

  const onRun = useCallback((): void => {
    if (selected !== '') {
      run(selected);
    }
  }, [run, selected]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="extraction-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="extraction-heading" className="text-content text-lg font-semibold">
          {t('heading')}
        </h2>
        {items.length === 0 ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              download(items, selected, citations);
            }}
          >
            {t('download')}
          </Button>
        )}
      </div>

      <p className="text-content-muted text-sm">{t('intro')}</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-content-muted text-xs">{t('schemaLabel')}</span>
          <select
            value={selected}
            disabled={running || schemas.length === 0}
            onChange={(event) => {
              reset();
              setSelected(event.target.value);
            }}
            className="border-border bg-surface text-content rounded-md border px-3 py-2 text-sm"
          >
            {schemas.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {t.has(`schema.${entry.name}`) ? t(`schema.${entry.name}`) : entry.title}
              </option>
            ))}
          </select>
        </label>

        {running ? (
          <Button variant="secondary" onClick={stop}>
            {t('stop')}
          </Button>
        ) : (
          <Button disabled={selected === ''} onClick={onRun}>
            {t('run')}
          </Button>
        )}

        {running ? <Spinner label={t('waiting')} /> : null}

        {status === 'done' && dropped > 0 ? (
          // Said plainly rather than hidden: a dropped item is data the
          // reader asked for and did not get.
          <StatusBadge tone="warn">{t('dropped', { count: dropped })}</StatusBadge>
        ) : null}
      </div>

      {loadFailed ? <p className="text-danger text-sm">{t('schemasUnavailable')}</p> : null}

      {error === null ? null : (
        <p className="border-danger/30 bg-danger/10 text-danger rounded border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {schema === undefined ? null : (
        <ExtractionTable fields={schema.fields} items={items} streaming={running} />
      )}

      {citations.length === 0 ? null : (
        <p className="text-content-muted text-xs">
          {t('readFrom', {
            count: citations.length,
            documents: new Intl.ListFormat(locale, { style: 'short' }).format([
              ...new Set(citations.map((citation) => citation.documentTitle)),
            ]),
          })}
        </p>
      )}
    </section>
  );
}
