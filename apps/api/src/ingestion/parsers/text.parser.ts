import { Injectable } from '@nestjs/common';

import { type ParsedDocument } from '../chunker/index.js';
import { normaliseText, parseBlocks } from './block-parser.js';
import { type Parser, UnreadableDocumentError } from './parser.js';

/** Reads Markdown and plain text. */
@Injectable()
export class TextParser implements Parser {
  /**
   * Handles Markdown and plain text.
   *
   * Both go through the same block parser: a `.txt` file that happens to use
   * `#` headings gets the structure, and a `.md` file with none degrades to
   * paragraphs. Treating them differently would mean the same bytes chunk
   * differently depending on their extension.
   */
  supports(mimeType: string): boolean {
    return (
      mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/x-markdown'
    );
  }

  /**
   * Decodes the bytes as UTF-8 and splits them into segments.
   *
   * @param bytes File contents.
   * @returns The parsed document, with offsets into its normalised text.
   * @throws {UnreadableDocumentError} If the bytes are not valid UTF-8, or
   *   decode to nothing but whitespace.
   */
  // Declared async so a failure rejects rather than throwing synchronously
  // from a method whose signature promises otherwise; a caller using `.catch`
  // would miss a synchronous throw entirely.
  // eslint-disable-next-line @typescript-eslint/require-await -- see above
  async parse(bytes: Uint8Array): Promise<ParsedDocument> {
    let decoded: string;

    try {
      // `fatal` so that binary mistakenly labelled as text is rejected rather
      // than silently turned into replacement characters and embedded.
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new UnreadableDocumentError('The file is not valid UTF-8 text.', { cause });
    }

    const text = normaliseText(decoded);

    if (text.trim().length === 0) {
      throw new UnreadableDocumentError('The file contains no text.');
    }

    return {
      text,
      segments: parseBlocks(text),
      pages: [],
      pageCount: null,
    };
  }
}
