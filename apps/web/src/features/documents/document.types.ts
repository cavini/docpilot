/** Where a document is in the ingestion pipeline. */
export type DocumentStatus = 'queued' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'failed';

/** Text-search configuration detected for a document. */
export type DocumentLanguage = 'english' | 'portuguese';

/**
 * A document as the API returns it.
 *
 * Mirrors `DocumentResponseDto` in the API. Declared here rather than imported
 * from the API package because the web app must depend on the published HTTP
 * contract, not on the server's internals — the same reason the contract tests
 * validate against `openapi.json` rather than against the DTO class.
 */
export interface DocumentSummary {
  id: string;
  title: string;
  sourceFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  /** Percentage, 0 to 100. */
  progress: number;
  language: DocumentLanguage | null;
  /** Why ingestion failed, when it did. */
  error: string | null;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One page of documents, newest first. */
export interface DocumentPage {
  items: DocumentSummary[];
  /** Pass back as `cursor` for the next page. Null on the last. */
  nextCursor: string | null;
}

/** Statuses that mean ingestion is still running. */
export const IN_FLIGHT_STATUSES: readonly DocumentStatus[] = [
  'queued',
  'parsing',
  'chunking',
  'embedding',
];

/**
 * Whether a document is still being ingested.
 *
 * Used to decide which documents to subscribe to for progress, so a corpus of
 * a thousand ready documents does not open a thousand subscriptions.
 *
 * @param document The document to check.
 * @returns `true` while ingestion is still in progress.
 */
export function isInFlight(document: Pick<DocumentSummary, 'status'>): boolean {
  return IN_FLIGHT_STATUSES.includes(document.status);
}
