/**
 * A structural unit of a parsed document.
 *
 * Parsers reduce every format to this shape, so the chunker never needs to
 * know whether the text came from Markdown, a PDF or a plain file. It is the
 * seam that keeps chunking pure, testable logic over strings.
 */
export interface Segment {
  /**
   * What the segment is.
   *
   * - `heading`: starts a new section and contributes to the heading path.
   * - `paragraph`: ordinary prose, and the usual unit of accumulation.
   * - `code`: a fenced block, kept whole where it fits.
   */
  kind: 'heading' | 'paragraph' | 'code';

  /** Heading depth, 1 for a top-level heading. Only set for headings. */
  level?: number;

  /** The segment's text, already normalised. */
  text: string;

  /** Offset of `text` in the document's normalised text. */
  charStart: number;

  /** Offset one past the end of `text`. */
  charEnd: number;
}

/** Where a page starts and ends in the document's normalised text. */
export interface PageSpan {
  /** One-based page number, as a reader would cite it. */
  page: number;
  charStart: number;
  charEnd: number;
}

/**
 * A document reduced to the form the chunker consumes.
 *
 * `text` is the full normalised text, and every offset in `segments` and
 * `pages` indexes into it, so a chunk can always be traced back to its exact
 * position in the source.
 */
export interface ParsedDocument {
  text: string;
  segments: Segment[];
  /** Page spans, for formats that have pages. Empty otherwise. */
  pages: PageSpan[];
  /** Number of pages, or null for a format without them. */
  pageCount: number | null;
}
