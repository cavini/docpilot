/**
 * A citation as the API publishes it.
 *
 * Mirrors `CitationDto`. Declared here rather than imported from the API,
 * because the web app depends on the published HTTP contract and not on the
 * server's internals.
 */
export interface Citation {
  /** The number as it appears in the answer. */
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  /** The passage's own text, not the heading-prefixed embedding text. */
  snippet: string;
}

/** How an assistant turn ended. */
export type MessageOutcome = 'complete' | 'stopped' | 'failed';
