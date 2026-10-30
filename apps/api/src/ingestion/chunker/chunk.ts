/** A passage ready to be embedded and stored. */
export interface Chunk {
  /** Position in the document, from 0, with no gaps. */
  ordinal: number;

  /** The passage itself. */
  content: string;

  /** Tokens in `content`, counted with the same tokenizer used to split it. */
  tokenCount: number;

  /**
   * The chain of headings above this passage, joined by `" > "`, such as
   * `"Auth > Tokens > Refresh"`. Null when the document has no headings.
   */
  headingPath: string | null;

  /** First page this passage touches, or null for a format without pages. */
  pageStart: number | null;

  /** Last page this passage touches, or null. */
  pageEnd: number | null;

  /** Offset of this passage in the document's normalised text. */
  charStart: number;

  /** Offset one past the end. */
  charEnd: number;
}

/** How to split a document. */
export interface ChunkOptions {
  /**
   * Target ceiling for a chunk, in tokens.
   *
   * Exceeded only to keep a code block whole, which is a deliberate trade: a
   * slightly oversized chunk is more useful than half a code sample.
   */
  maxTokens: number;

  /**
   * Roughly how many tokens consecutive chunks share.
   *
   * Overlap exists so that a sentence which answers a question is not lost
   * because it happened to land on a boundary. Must be smaller than
   * `maxTokens`.
   */
  overlapTokens: number;

  /** Counts tokens the way the embedding model will. */
  countTokens: (text: string) => number;
}
