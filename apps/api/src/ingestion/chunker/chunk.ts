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

/**
 * The text a chunk should be embedded as.
 *
 * Prefixes the heading path, because a passage frequently never names the
 * section it belongs to. The chunk under "Authentication" begins "Call
 * POST /auth/token…" and contains the word "authentication" nowhere, so its
 * embedding sits far from the question "how do I authenticate?" unless the
 * heading travels with it.
 *
 * Only the embedding and the keyword index see this. A citation shows the
 * passage itself, so the reader gets the text rather than a path they can
 * already see in the citation's own metadata.
 *
 * @param chunk The chunk to embed.
 * @returns Text to send to the embedding model.
 *
 * @example
 * ```ts
 * embeddingTextFor({ headingPath: 'Auth > Tokens', content: 'Call POST…' });
 * // 'Auth > Tokens\n\nCall POST…'
 * ```
 */
export function embeddingTextFor(chunk: Pick<Chunk, 'headingPath' | 'content'>): string {
  return chunk.headingPath ? `${chunk.headingPath}\n\n${chunk.content}` : chunk.content;
}
