import { type ParsedDocument } from '../chunker/index.js';

/** MIME types the pipeline can read. */
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
] as const;

/** A MIME type the pipeline can read. */
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** Turns a document's bytes into the form the chunker consumes. */
export interface Parser {
  /** Whether this parser handles the given MIME type. */
  supports: (mimeType: string) => boolean;

  /**
   * Extracts text and structure.
   *
   * @throws {UnreadableDocumentError} If the bytes cannot be read at all.
   */
  parse: (bytes: Uint8Array) => Promise<ParsedDocument>;
}

/**
 * A document that cannot be read.
 *
 * Distinct from a bug: a corrupt PDF or a scan with no text layer is a normal
 * thing for a user to upload, and the pipeline reports it rather than retrying
 * it forever.
 */
export class UnreadableDocumentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnreadableDocumentError';
  }
}
