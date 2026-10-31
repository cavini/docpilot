/** A chunk found by search, with everything a citation needs. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
}

/** A retrieved chunk with its fused score and per-method ranks. */
export interface ScoredChunk extends RetrievedChunk {
  /** Fused score. Comparable within one search, not across searches. */
  score: number;
  /** Rank in the vector search, or null if it did not appear. */
  vectorRank: number | null;
  /** Rank in the keyword search, or null if it did not appear. */
  keywordRank: number | null;
}

/** What to search for. */
export interface SearchOptions {
  query: string;
  /** How many results to return after fusion. */
  topK?: number;
  /** Restrict to these documents. Empty or absent means the whole corpus. */
  documentIds?: string[];
}

/** A completed search. */
export interface SearchResult {
  results: ScoredChunk[];
  tookMs: number;
  /** Whether the query embedding came from cache. */
  cached: boolean;
}
