'use client';

import { useCallback, useRef, useState } from 'react';

import { demoKeyHeaders } from '../access/demo-key';
import {
  type ExtractionCitation,
  type ExtractionStatus,
  type SchemaSummary,
} from './extraction.types';
import { parseEvents } from './parse-events';

/** Base URL of the Nest API. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** What the hook gives the extraction view. */
export interface Extraction {
  status: ExtractionStatus;
  /** Rows that have arrived, in order. */
  items: Record<string, unknown>[];
  citations: ExtractionCitation[];
  /** Items the server dropped for failing validation. */
  dropped: number;
  /**
   * True when the rows did not come from a real model.
   *
   * Either no provider is connected or the day's budget is spent. The table
   * has to say so above itself: a placeholder row that explains itself in
   * its own cells is indistinguishable from data.
   */
  degraded: boolean;
  /** True when the budget, rather than a missing provider, is the reason. */
  budgetSpent: boolean;
  error: string | null;
  run: (schema: string, options?: { documentId?: string; query?: string }) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Runs a streamed extraction, filling a list a row at a time.
 *
 * `fetch` with a reader rather than `EventSource`, because the request is a
 * POST with a body — `EventSource` only does GET, and putting the schema and
 * the query in a URL would put a reader's query text into access logs.
 *
 * Rows are appended as they arrive and never replaced, so the table grows
 * rather than flickering. The server only sends completed items, so there is
 * no partial row to guard against here.
 *
 * @returns The rows so far, where the extraction has got to, and the controls
 *   to start and stop it.
 */
export function useExtraction(): Extraction {
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [citations, setCitations] = useState<ExtractionCitation[]>([]);
  const [dropped, setDropped] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const [budgetSpent, setBudgetSpent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback((): void => {
    abort.current?.abort();
    abort.current = null;
    setStatus((current) => (current === 'running' ? 'done' : current));
  }, []);

  const reset = useCallback((): void => {
    abort.current?.abort();
    abort.current = null;
    setStatus('idle');
    setItems([]);
    setCitations([]);
    setDropped(0);
    setDegraded(false);
    setBudgetSpent(false);
    setError(null);
  }, []);

  const run = useCallback(
    (schema: string, options: { documentId?: string; query?: string } = {}): void => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setStatus('running');
      setItems([]);
      setCitations([]);
      setDropped(0);
      setDegraded(false);
      setBudgetSpent(false);
      setError(null);

      void (async () => {
        try {
          const response = await fetch(`${API_URL}/extract/stream`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...demoKeyHeaders() },
            body: JSON.stringify({ schema, ...options }),
            signal: controller.signal,
          });

          if (!response.ok) {
            // The server validated before opening the stream, so this is a
            // real error body rather than an event.
            const body = (await response.json()) as { error?: { message?: string } };

            setError(body.error?.message ?? 'The extraction could not start.');
            setStatus('failed');

            return;
          }

          const reader = response.body?.getReader();

          if (!reader) {
            setError('The extraction returned no stream.');
            setStatus('failed');

            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // `stream: true` keeps a multi-byte character split across two
            // chunks from becoming a replacement character.
            buffer += decoder.decode(value, { stream: true });

            const parsed = parseEvents(buffer);
            buffer = parsed.rest;

            for (const event of parsed.events) {
              if (event.type === 'schema') {
                setCitations(event.citations);
                setDegraded(event.degraded === true);
                // A reset time is only sent when the ceiling is the reason.
                setBudgetSpent(
                  event.degraded === true &&
                    event.resetsAt !== null &&
                    event.resetsAt !== undefined,
                );
              } else if (event.type === 'item') {
                setItems((current) => [...current, event.item]);
              } else if (event.type === 'done') {
                setDropped(event.dropped);
              } else {
                setError(event.message);
              }
            }
          }

          setStatus((current) => (current === 'running' ? 'done' : current));
        } catch (caught) {
          // An abort is the reader pressing stop, not a failure.
          if (caught instanceof DOMException && caught.name === 'AbortError') {
            return;
          }

          setError(caught instanceof Error ? caught.message : 'The extraction failed.');
          setStatus('failed');
        } finally {
          abort.current = null;
        }
      })();
    },
    [],
  );

  return { status, items, citations, dropped, degraded, budgetSpent, error, run, stop, reset };
}

/**
 * Fetches the schemas the server can extract.
 *
 * Separate from the hook above because it is a plain read that happens once,
 * and because the chooser needs it before any extraction is run.
 *
 * @param signal Aborts the request when the component goes away.
 * @returns The schemas, with the fields a table renders.
 */
export async function fetchSchemas(signal?: AbortSignal): Promise<SchemaSummary[]> {
  const response = await fetch(`${API_URL}/extract/schemas`, {
    headers: demoKeyHeaders(),
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw new Error('The schemas could not be loaded.');
  }

  const body = (await response.json()) as { schemas: SchemaSummary[] };

  return body.schemas;
}
