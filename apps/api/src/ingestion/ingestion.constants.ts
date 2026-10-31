/** Name of the BullMQ queue that carries ingestion work. */
export const INGESTION_QUEUE = 'ingestion';

/** Payload of an ingestion job. */
export interface IngestionJobData {
  documentId: string;
}

/**
 * Progress percentages each stage reports when it starts.
 *
 * Fixed points rather than a computed fraction: the stages take wildly
 * different amounts of time, and a bar that races to 90% and then sits there
 * is worse than one that moves in understood steps.
 */
export const STAGE_PROGRESS = {
  parsing: 10,
  chunking: 35,
  embedding: 55,
  ready: 100,
} as const;
