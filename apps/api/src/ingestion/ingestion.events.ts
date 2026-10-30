import { type DocumentRow } from '../db/schema/index.js';

/** Events the progress gateway pushes to subscribed clients. */
export const INGESTION_EVENTS = {
  progress: 'ingestion.progress',
  completed: 'ingestion.completed',
  failed: 'ingestion.failed',
} as const;

/** A stage change. */
export interface IngestionProgressEvent {
  documentId: string;
  status: DocumentRow['status'];
  progress: number;
}

/** A document finished successfully. */
export interface IngestionCompletedEvent {
  documentId: string;
  status: 'ready';
  chunkCount: number;
  pageCount: number | null;
}

/** A document failed. */
export interface IngestionFailedEvent {
  documentId: string;
  status: 'failed';
  error: string;
}

/**
 * Internal event name the processor emits on.
 *
 * The processor does not talk to sockets directly. It emits, and the gateway
 * listens, so that ingestion has no opinion about whether anyone is watching
 * and the two can run in different processes.
 */
export const INGESTION_EVENT_CHANNEL = 'ingestion.event';

/** Any event the processor emits. */
export type IngestionEvent =
  | { type: 'progress'; payload: IngestionProgressEvent }
  | { type: 'completed'; payload: IngestionCompletedEvent }
  | { type: 'failed'; payload: IngestionFailedEvent };
