'use client';

import { useEffect } from 'react';
import { type Socket, io } from 'socket.io-client';

import { demoKeyHeaders } from '../access/demo-key';
import { docpilotApi } from '../../store/api';
import { useAppDispatch } from '../../store/hooks';
import { type DocumentLanguage, type DocumentStatus, type DocumentSummary } from './document.types';

/** Namespace the API's ingestion gateway listens on. */
const NAMESPACE = '/ingestion';

/** Payload of `ingestion.progress`. */
interface ProgressEvent {
  documentId: string;
  status: DocumentStatus;
  progress: number;
}

/**
 * Payload of `ingestion.completed`.
 *
 * Carries everything ingestion determined, not only what changed since the
 * last tick, so the row can be finished from the event alone with no refetch.
 */
interface CompletedEvent {
  documentId: string;
  status: 'ready';
  chunkCount: number;
  pageCount: number | null;
  language: DocumentLanguage;
}

/** Payload of `ingestion.failed`. */
interface FailedEvent {
  documentId: string;
  status: 'failed';
  error: string;
}

/** What the gateway answers a `subscribe` with. */
type SubscribeAck = { ok: true; documentIds: string[] } | { ok: false; error: string };

/**
 * Reports a refused subscription.
 *
 * Isolated in one function so there is a single place to send this once the
 * app has client-side telemetry, rather than a `console` call buried in an
 * effect.
 *
 * @param reason What the gateway said.
 */
function reportSubscriptionRefused(reason: string): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console -- the development-only channel for a non-fatal degradation
    console.warn(`[docpilot] ingestion subscribe refused: ${reason}`);
  }
}

/** Base URL of the API, which is also where the socket lives. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Keeps the cached document list in step with live ingestion events.
 *
 * Patches the RTK Query cache directly rather than invalidating it. An
 * invalidation would refetch the whole page on every progress tick — four or
 * more requests per document — to apply a change the event already contained.
 * Patching is one reducer call and the row updates immediately.
 *
 * Only documents still being ingested are subscribed to. A corpus of a
 * thousand `ready` documents would otherwise open a thousand subscriptions to
 * be told nothing.
 *
 * The socket is **optional**. If it never connects, statuses are still correct
 * on reload and every other part of the app works; what is lost is liveness.
 * That matters because a progress feed that takes the page down when it drops
 * is worse than no progress feed.
 *
 * @param documentIds Ids to watch. Re-subscribes when the set changes.
 *
 * @example
 * ```ts
 * useIngestionProgress(documents.filter(isInFlight).map((d) => d.id));
 * ```
 */
export function useIngestionProgress(documentIds: readonly string[]): void {
  const dispatch = useAppDispatch();
  // Joined rather than passed as an array, so the effect re-runs when the set
  // of ids changes and not when a new array with the same ids is rendered.
  const key = [...documentIds].sort().join(',');

  useEffect(() => {
    if (key === '') {
      return;
    }

    const ids = key.split(',');
    const socket: Socket = io(`${API_URL}${NAMESPACE}`, {
      // Socket.IO has no request headers on a websocket upgrade, so the key
      // travels in the handshake payload, which is where the gateway reads
      // it from.
      auth: demoKeyHeaders(),
      transports: ['websocket'],
      // Reconnection is the default; naming it here because the resubscribe
      // below depends on it.
      reconnection: true,
    });

    /**
     * Applies one event to the cached list.
     *
     * `updateQueryData` is a no-op when the query is not cached, so an event
     * arriving before the list has loaded is harmless.
     */
    const patch = (documentId: string, changes: Partial<DocumentSummary>): void => {
      dispatch(
        docpilotApi.util.updateQueryData('listDocuments', undefined, (page) => {
          const row = page.items.find((item) => item.id === documentId);

          if (row) {
            Object.assign(row, changes);
          }
        }),
      );
    };

    const subscribe = (): void => {
      // The acknowledgement carries each document's current state, so a client
      // that connects after ingestion started is not left waiting for an event
      // that already fired — the common case, because the upload response and
      // this subscription race.
      socket.emit('subscribe', { documentIds: ids }, (ack: SubscribeAck) => {
        if (!ack.ok) {
          // One refused subscription loses liveness for these documents and
          // nothing else: their status is still correct on reload. Reported
          // rather than thrown, because taking the page down over a progress
          // feed is worse than losing the progress feed.
          reportSubscriptionRefused(ack.error);
        }
      });
    };

    socket.on('connect', subscribe);

    socket.on('ingestion.progress', (event: ProgressEvent) => {
      patch(event.documentId, { status: event.status, progress: event.progress });
    });

    socket.on('ingestion.completed', (event: CompletedEvent) => {
      patch(event.documentId, {
        status: 'ready',
        progress: 100,
        chunkCount: event.chunkCount,
        pageCount: event.pageCount,
        language: event.language,
        error: null,
      });
    });

    socket.on('ingestion.failed', (event: FailedEvent) => {
      patch(event.documentId, { status: 'failed', error: event.error });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [dispatch, key]);
}
